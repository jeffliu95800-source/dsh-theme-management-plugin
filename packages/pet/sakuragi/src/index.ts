/**
 * Sakuragi pet host half — mounts the pet service and its HTTP routes. The
 * browser half (`./client`) renders the character and drives it through the
 * same-origin `/api/sakuragi/*` JSON endpoints plus the `/sakuragi/<pose>.png`
 * media routes.
 * @module @deepseek-ai/dsh-sakuragi
 */

import { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { PetService, PET_SETTINGS_NAMESPACE, type PetConfig, type PetSettingsSection } from './service.ts'
import { makePetRoutes, petPackageRoot } from './routes.ts'
import { DEFAULT_PET_NAME, DISPLAY_INSET_MAX, DISPLAY_SIZE_MAX, DISPLAY_SIZE_MIN, PET_NAME_MAX_LENGTH } from './persist.ts'

export { PetService } from './service.ts'
export type { PetConfig, PetStateView, PetInteractResult, PetSettingsSection, ActivityPhase } from './service.ts'
export { PetStateMachine } from './service.ts'
export { AFFINITY_MAX, AFFINITY_RANKS, applyInteraction, applyTurnReward, emptyAffinity, rankOf } from './affinity.ts'
export type { AffinityConfig, AffinityState, InteractionOutcome, PetInteraction } from './affinity.ts'
export { defaultDisplayConfig, emptyPersist, loadPetPersist, petHomeDir, savePetPersist } from './persist.ts'
export type { PetDisplayConfig, PetPersist } from './persist.ts'
export { makePetRoutes, petPackageRoot, PET_API_PREFIX, PET_ASSET_PREFIX } from './routes.ts'

/** Stable cordis plugin name (matches the bundle insert id). */
export const name = 'sakuragi-pet'

/** Services required before the pet can mount its surfaces. */
export const inject = ['webServer']

/** Settings section schema: the display fields and name the settings surface edits. */
export const PET_SETTINGS_SCHEMA = z.object({
  visible: z.boolean().default(true),
  size: z.number().step(1).min(DISPLAY_SIZE_MIN).max(DISPLAY_SIZE_MAX).default(180),
  right: z.number().step(1).min(0).max(DISPLAY_INSET_MAX).default(24),
  bottom: z.number().step(1).min(0).max(DISPLAY_INSET_MAX).default(20),
  name: z.string().min(1).max(PET_NAME_MAX_LENGTH).pattern(/\S/).default(DEFAULT_PET_NAME),
  enabled: z.boolean().default(true),
})

/**
 * Register the pet service and its API + asset routes on the context.
 * @param ctx - owning context.
 * @param config - optional tuning (affinity, persistence dir, enabled).
 */
export function apply(ctx: Context, config: Omit<PetConfig, 'packageRoot'> = {}): void {
  const packageRoot = petPackageRoot(import.meta.url)
  const service = new PetService(ctx, { ...config, packageRoot })

  const base: PetSettingsSection = {
    visible: service.display().visible,
    size: service.display().size,
    right: service.display().right,
    bottom: service.display().bottom,
    name: service.petName(),
    enabled: config.enabled ?? true,
  }
  let current: () => PetSettingsSection = () => base

  const routes = makePetRoutes({ service })
  let disposeRoutes: (() => void) | undefined
  const syncRoutes = (): void => {
    const enabled = current().enabled ?? true
    if (disposeRoutes === undefined && enabled) {
      disposeRoutes = ctx.effect(
        () => {
          const disposers = routes.map(route => ctx.webServer.register(route))
          return () => { for (const dispose of disposers) dispose() }
        },
        'sakuragi: routes',
      )
    } else if (disposeRoutes !== undefined && !enabled) {
      disposeRoutes()
      disposeRoutes = undefined
    }
  }

  installSettingsSection(ctx, settingsNamespace(PET_SETTINGS_NAMESPACE), PET_SETTINGS_SCHEMA, base, {
    setSource: (source) => { current = source },
    onChange: () => {
      const section = current()
      service.applySettingsSection(section)
      service.setEnabled(section.enabled ?? true)
      syncRoutes()
    },
  })
  syncRoutes()
}
