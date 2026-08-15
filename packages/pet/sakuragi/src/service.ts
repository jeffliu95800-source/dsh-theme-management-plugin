/**
 * Desktop-pet host service — character-agnostic. Owns the state machine (maps
 * core session events turn/step/tool boundaries onto pet phases), the affinity
 * ledger, and the persisted display config. All persona copy (name, bubbles,
 * reactions, ranks) and the pose list come from the character pack (data), so
 * swapping characters never touches code. The browser half talks to it through
 * the same-origin `/api/sakuragi/*` JSON endpoints built by routes.ts.
 * @module @deepseek-ai/dsh-sakuragi/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { join } from 'node:path'
import type { CharacterPack } from './character.ts'
import {
  activePetId,
  createPet as createPetDir,
  deletePet as deletePetDir,
  ensureLibraryMeta as ensurePetLibraryMeta,
  listMusicFiles,
  listPetIds,
  listPets,
  listPoseFiles,
  loadPet,
  petPosesDir as petPosesDirOf,
  petsRoot,
  poseDirName,
  renamePet as renamePetDir,
  seedBuiltinPet,
  setActivePetId,
  setMaterialRoot,
  setPetMusicEnabled as setPetMusicEnabledDir,
  updatePetActions as updatePetActionsDir,
  updatePetQuotes as updatePetQuotesDir,
  BUILTIN_PET_ID,
  type PetSummary,
} from './pets.ts'
import {
  activeThemeId,
  backgroundDirName,
  createTheme as createThemeDir,
  deleteTheme as deleteThemeDir,
  ensureLibraryMeta as ensureThemeLibraryMeta,
  listThemeBackgrounds,
  listThemeIds,
  listThemes,
  renameTheme as renameThemeDir,
  seedBuiltinTheme,
  setActiveThemeId,
  themeBackgroundsDir,
  themeName,
  type ThemeSummary,
} from './themes.ts'
import {
  applyInteraction,
  applyTurnReward,
  defaultAffinityConfig,
  rankOf,
  type AffinityConfig,
  type AffinityState,
  type PetInteraction,
} from './affinity.ts'
import {
  loadPetPersist,
  petHomeDir,
  savePetPersist,
  DISPLAY_INSET_MAX,
  DISPLAY_SIZE_MAX,
  DISPLAY_SIZE_MIN,
  PET_NAME_MAX_LENGTH,
  type PetDisplayConfig,
  type PetPersist,
} from './persist.ts'
import { deleteFile } from './upload.ts'

/** The pet's working-phase vocabulary, derived from core session events. */
export type ActivityPhase = 'idle' | 'waiting' | 'thinking' | 'tool' | 'done'

/** Plugin configuration. */
export interface PetConfig {
  affinity?: Partial<AffinityConfig>
  persistDir?: string
  enabled?: boolean
  /** Package root whose assets/ holds the character pack. */
  packageRoot: string
  /** Material-library root (each subfolder = one theme+character combo); unset keeps the legacy layout. */
  materialRoot?: string
}

/** The pet's settings-namespace section edited by the web settings surface. */
export interface PetSettingsSection {
  visible: boolean
  size: number
  right: number
  bottom: number
  name: string
  enabled?: boolean
}

/** Settings namespace of the pet capability. */
export const PET_SETTINGS_NAMESPACE = 'sakuragi-pet'

/** Snapshot returned by the state route. */
export interface PetStateView {
  phase: ActivityPhase
  bubble?: string
  sessionActive: boolean
  affinity: {
    points: number
    rank: string
    rankEmoji: string
    pets: number
    passes: number
    turns: number
    petCooldown: boolean
    passCooldown: boolean
  }
  display: PetDisplayConfig
  name: string
  /** Pose SVG filenames served under /sakuragi/poses/ (for pose rotation). */
  poses: string[]
  /** Background music served under /sakuragi/pets/<id>/music/. */
  music: { enabled: boolean; files: string[] }
  /** Interaction button labels. */
  actions: { pet: string; pass: string }
}

/** One pet's editable config returned to the edit modal. */
export interface PetConfigView {
  id: string
  name: string
  /** Phase → bubble line (non-interaction quotes). */
  bubbles: Record<string, string>
  /** Interaction reactions (button-click quotes). */
  reactions: { pet: string; petCooldown: string; pass: string; passCooldown: string }
  /** Interaction button labels (customizable). */
  actions: { pet: string; pass: string }
  fallback: string[]
  /** Pose image URL paths. */
  poses: string[]
  /** Background-music state and file URL paths. */
  music: { enabled: boolean; files: string[] }
}

/** Quote replacement patch (both fields optional; missing fields stay). */
export interface PetQuotesPatch {
  bubbles?: Record<string, string>
  reactions?: Record<string, string>
}

/** One theme's editable config returned to the edit modal. */
export interface ThemeConfigView {
  id: string
  name: string
  /** Background image URL paths. */
  backgrounds: string[]
}

/** Result of an interaction. */
export interface PetInteractResult {
  reaction: string
  delta: number
  affinity: PetStateView['affinity']
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    sakuragi: PetService
  }
}

/** One-shot celebration window after `done` before settling idle. */
const CELEBRATE_MS = 2400

/**
 * The pet state machine: holds the last phase and a celebration window after
 * `done`. Pure and clock-injected; persona copy and persistence live in the
 * service.
 */
export class PetStateMachine {
  private phase: ActivityPhase = 'idle'
  private doneAt: number | undefined
  private sessionActive = false

  constructor(private readonly now: () => number = Date.now) {}

  onPhase(phase: ActivityPhase): void {
    this.phase = phase
    if (phase === 'done') this.doneAt = this.now()
  }

  onSessionActive(): void {
    this.sessionActive = true
  }

  onSessionDisposed(): void {
    this.sessionActive = false
    this.phase = 'idle'
    this.doneAt = undefined
  }

  render(): { phase: ActivityPhase; sessionActive: boolean } {
    let phase = this.phase
    if (phase === 'done' && this.doneAt !== undefined && this.now() - this.doneAt >= CELEBRATE_MS) {
      phase = 'idle'
    }
    return { phase, sessionActive: this.sessionActive }
  }
}

/**
 * Cordis service exposing the pet domain. Lazy: nothing is written until an
 * interaction or config change arrives; event listeners update only in-memory
 * state, and persistence happens on interactions, completed turns, and config
 * changes.
 */
export class PetService extends Service {
  static inject: string[] = []

  private readonly machine: PetStateMachine
  private readonly affinityConfig: AffinityConfig
  private readonly persistDir: string
  private readonly packageRoot: string
  private activeId: string
  private character: CharacterPack
  private persist: PetPersist
  private enabled: boolean
  private disposeActivity: (() => void) | undefined
  private rewardedTurns = new Map<string, number>()

  constructor(ctx: Context, config: PetConfig) {
    super(ctx, 'sakuragi')
    this.packageRoot = config.packageRoot
    setMaterialRoot(config.materialRoot)
    seedBuiltinPet(config.packageRoot)
    seedBuiltinTheme()
    ensurePetLibraryMeta()
    ensureThemeLibraryMeta()
    this.activeId = activePetId()
    this.character = loadPet(this.activeId)
    this.persistDir = config.persistDir ?? petHomeDir()
    this.affinityConfig = { ...defaultAffinityConfig, ...(config.affinity ?? {}) }
    this.machine = new PetStateMachine()
    this.persist = loadPetPersist(this.persistDir, this.character.name)
    this.enabled = config.enabled ?? true
    this.syncActivity()
  }

  /** The active pet's character pack (browser half consumes it via /character.json). */
  characterPack(): CharacterPack {
    return this.character
  }

  /** Active pet id. */
  petId(): string {
    return this.activeId
  }

  /** Active pet's poses directory (upload target; layout-aware). */
  petPosesDir(): string {
    return petPosesDirOf(this.activeId)
  }

  /** Reload the active pet's pack (reflects pose uploads without a restart). */
  reloadCharacter(): void {
    this.character = loadPet(this.activeId)
  }

  /** List pets for the settings surface. */
  pets(): PetSummary[] {
    return listPets()
  }

  /** Create a new pet from a name; returns its id. */
  createPet(name: string): string {
    return createPetDir(name)
  }

  /** Switch the active pet. */
  async activatePet(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
    let pack: CharacterPack
    try {
      pack = loadPet(id)
    } catch {
      return { ok: false, error: 'unknown-pet' }
    }
    this.activeId = id
    this.character = pack
    setActivePetId(id)
    // Auto-play the selected character's music: enable it when it has tracks.
    if (!pack.music.enabled && listMusicFiles(id).length > 0) {
      setPetMusicEnabledDir(id, true)
      this.reloadCharacter()
    }
    this.persist = { ...this.persist, name: pack.name }
    this.flush()
    this.syncSettingsFromPet()
    return { ok: true }
  }

  /** Pose URL paths of the active pet (live listing; layout-aware dir name). */
  poses(): string[] {
    return listPoseFiles(this.activeId).map(file => `/sakuragi/pets/${this.activeId}/${poseDirName()}/${file}`)
  }

  /** List themes for the settings surface. */
  themes(): ThemeSummary[] {
    return listThemes()
  }

  /** Switch the active theme. */
  async activateTheme(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!listThemeIds().includes(id)) return { ok: false, error: 'unknown-theme' }
    setActiveThemeId(id)
    return { ok: true }
  }

  /** Create a new theme; returns its id. */
  createTheme(name: string): string {
    return createThemeDir(name)
  }

  /** Background URL paths of the active theme (empty → bundled fallback). */
  themeBackgrounds(): string[] {
    const id = activeThemeId()
    return listThemeBackgrounds(id).map(file => `/sakuragi/themes/${id}/${backgroundDirName()}/${file}`)
  }

  /** Backgrounds directory of the active theme (upload target). */
  activeThemeBackgroundsDir(): string {
    return themeBackgroundsDir(activeThemeId())
  }

  /** Active pet's background-music directory (upload target). */
  petMusicDir(): string {
    return join(petsRoot(), this.activeId, 'music')
  }

  /** Music URL paths of the active pet. */
  musicFiles(): string[] {
    return listMusicFiles(this.activeId).map(file => `/sakuragi/pets/${this.activeId}/music/${file}`)
  }

  /** Editable config of one pet for the edit modal. */
  async petConfig(id: string): Promise<PetConfigView> {
    const pack = loadPet(id)
    return {
      id,
      name: pack.name,
      bubbles: pack.bubbles,
      reactions: pack.reactions,
      actions: pack.actions,
      fallback: pack.fallback,
      poses: listPoseFiles(id).map(file => `/sakuragi/pets/${id}/${poseDirName()}/${file}`),
      music: {
        enabled: pack.music.enabled,
        files: listMusicFiles(id).map(file => `/sakuragi/pets/${id}/music/${file}`),
      },
    }
  }

  /** Rename a pet (persona name shown in lists and on the floating pet). */
  async renamePet(id: string, name: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
    const trimmed = name.trim()
    if (trimmed === '') return { ok: false, error: 'name-empty' }
    if (trimmed.length > PET_NAME_MAX_LENGTH) return { ok: false, error: 'name-too-long' }
    renamePetDir(id, trimmed)
    if (this.activeId === id) {
      this.reloadCharacter()
      this.persist = { ...this.persist, name: trimmed }
      this.flush()
      this.syncSettingsFromPet()
    }
    return { ok: true, name: trimmed }
  }

  /** Replace one pet's phase bubbles and/or interaction reactions. */
  async updatePetQuotes(id: string, quotes: PetQuotesPatch): Promise<{ ok: true }> {
    updatePetQuotesDir(id, quotes)
    if (this.activeId === id) this.reloadCharacter()
    return { ok: true }
  }

  /** Replace one pet's interaction button labels. */
  async updatePetActions(id: string, actions: { pet: string; pass: string }): Promise<{ ok: true }> {
    updatePetActionsDir(id, actions)
    if (this.activeId === id) this.reloadCharacter()
    return { ok: true }
  }

  /** Toggle one pet's background music. */
  async setPetMusicEnabled(id: string, enabled: boolean): Promise<{ ok: true }> {
    setPetMusicEnabledDir(id, enabled)
    if (this.activeId === id) this.reloadCharacter()
    return { ok: true }
  }

  /** Delete one music file of a pet. */
  async deleteMusic(id: string, name: string): Promise<{ ok: boolean }> {
    const ok = deleteFile(join(petsRoot(), id, 'music'), name)
    if (this.activeId === id) this.reloadCharacter()
    return { ok }
  }

  /** Delete one pose image of a pet. */
  async deletePetPose(id: string, name: string): Promise<{ ok: boolean }> {
    const ok = deleteFile(petPosesDirOf(id), name)
    if (this.activeId === id) this.reloadCharacter()
    return { ok }
  }

  /** Delete a pet; the active selection falls back to the built-in. */
  async deletePet(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!listPetIds().includes(id)) return { ok: false, error: 'unknown-pet' }
    const wasActive = this.activeId === id
    deletePetDir(id)
    if (wasActive) {
      this.activeId = BUILTIN_PET_ID
      seedBuiltinPet(this.packageRoot)
      this.character = loadPet(this.activeId)
      this.persist = { ...this.persist, name: this.character.name }
      this.flush()
      this.syncSettingsFromPet()
    }
    return { ok: true }
  }

  /** Editable config of one theme for the edit modal. */
  async themeConfig(id: string): Promise<ThemeConfigView> {
    return {
      id,
      name: themeName(id),
      backgrounds: listThemeBackgrounds(id).map(file => `/sakuragi/themes/${id}/${backgroundDirName()}/${file}`),
    }
  }

  /** Rename a theme. */
  async renameTheme(id: string, name: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
    const trimmed = name.trim()
    if (trimmed === '') return { ok: false, error: 'name-empty' }
    if (trimmed.length > PET_NAME_MAX_LENGTH) return { ok: false, error: 'name-too-long' }
    renameThemeDir(id, trimmed)
    return { ok: true, name: trimmed }
  }

  /** Delete a theme; the active selection falls back to the built-in. */
  async deleteTheme(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!listThemeIds().includes(id)) return { ok: false, error: 'unknown-theme' }
    deleteThemeDir(id)
    return { ok: true }
  }

  /** Delete one background image of a theme. */
  async deleteThemeBackground(id: string, name: string): Promise<{ ok: boolean }> {
    return { ok: deleteFile(themeBackgroundsDir(id), name) }
  }

  display(): PetDisplayConfig {
    return { ...this.persist.display }
  }

  petName(): string {
    return this.persist.name
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.syncActivity()
  }

  private syncActivity(): void {
    if (this.disposeActivity !== undefined) {
      this.disposeActivity()
      this.disposeActivity = undefined
    }
    if (!this.enabled) return
    this.disposeActivity = (() => {
      const disposers = [
        this.ctx.on('session/event', (session: Session, event: SessionEvent) => {
          switch (event.type) {
            case 'turn/start':
            case 'step/start':
              this.machine.onSessionActive()
              this.machine.onPhase('thinking')
              break
            case 'tool/call':
              this.machine.onSessionActive()
              this.machine.onPhase('tool')
              break
            case 'turn/end':
              this.machine.onSessionActive()
              if (event.data.reason.kind === 'completed') {
                this.machine.onPhase('done')
                this.rewardTurn(String(session.id), event.data.turn)
              } else {
                this.machine.onPhase('idle')
              }
              break
            default:
              break
          }
        }),
        this.ctx.on('session/disposed', () => {
          this.machine.onSessionDisposed()
        }),
      ]
      return () => { for (const dispose of disposers) dispose() }
    })()
  }

  /** RPC: current pet state snapshot. */
  async state(): Promise<PetStateView> {
    const snapshot = this.machine.render()
    const bubble = this.character.bubbles[snapshot.phase]
    return {
      phase: snapshot.phase,
      ...(bubble === undefined ? {} : { bubble }),
      sessionActive: snapshot.sessionActive,
      affinity: this.affinityView(this.persist.affinity),
      display: { ...this.persist.display },
      name: this.persist.name,
      poses: this.poses(),
      music: { enabled: this.character.music.enabled, files: this.musicFiles() },
      actions: this.character.actions,
    }
  }

  /** RPC: head-pat or ball-pass. */
  async interact(kind: PetInteraction): Promise<PetInteractResult> {
    const nowMs = Date.now()
    const outcome = applyInteraction(
      this.persist.affinity, kind, nowMs, this.character.reactions, this.affinityConfig,
    )
    if (outcome.accepted) {
      this.persist = { ...this.persist, affinity: outcome.affinity }
      this.flush()
    }
    return { reaction: outcome.reaction, delta: outcome.delta, affinity: this.affinityView(outcome.affinity) }
  }

  /** RPC: show or hide the pet. */
  async setVisible(visible: boolean): Promise<{ ok: true; display: PetDisplayConfig }> {
    this.persist = { ...this.persist, display: { ...this.persist.display, visible } }
    this.flush()
    this.syncSettingsFromPet()
    return { ok: true, display: this.persist.display }
  }

  /** RPC: update display config (size / position), clamped to whole pixels. */
  async setConfig(patch: Partial<PetDisplayConfig>): Promise<{ ok: true; display: PetDisplayConfig }> {
    const next = { ...this.persist.display, ...patch }
    next.size = Math.round(Math.min(DISPLAY_SIZE_MAX, Math.max(DISPLAY_SIZE_MIN, next.size)))
    next.right = Math.round(Math.min(DISPLAY_INSET_MAX, Math.max(0, next.right)))
    next.bottom = Math.round(Math.min(DISPLAY_INSET_MAX, Math.max(0, next.bottom)))
    this.persist = { ...this.persist, display: next }
    this.flush()
    this.syncSettingsFromPet()
    return { ok: true, display: this.persist.display }
  }

  /** RPC: rename the pet (trimmed, 1–20 chars). */
  async setName(name: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
    const trimmed = name.trim()
    if (trimmed === '') return { ok: false, error: 'name-empty' }
    if (trimmed.length > PET_NAME_MAX_LENGTH) return { ok: false, error: 'name-too-long' }
    this.persist = { ...this.persist, name: trimmed }
    this.flush()
    this.syncSettingsFromPet()
    return { ok: true, name: trimmed }
  }

  /** Apply a committed settings section to the persisted display config. */
  applySettingsSection(section: PetSettingsSection): void {
    const next = { ...this.persist.display }
    next.visible = section.visible && (section.enabled ?? true)
    next.size = Math.round(Math.min(DISPLAY_SIZE_MAX, Math.max(DISPLAY_SIZE_MIN, section.size)))
    next.right = Math.round(Math.min(DISPLAY_INSET_MAX, Math.max(0, section.right)))
    next.bottom = Math.round(Math.min(DISPLAY_INSET_MAX, Math.max(0, section.bottom)))
    this.persist = { ...this.persist, display: next, name: section.name.trim() }
    this.flush()
  }

  private syncSettingsFromPet(): void {
    const settings = this.ctx.get('settings', false) as { update(ns: string, patch: object): Promise<void> } | undefined
    if (settings === undefined) return
    void settings.update(PET_SETTINGS_NAMESPACE, {
      visible: this.persist.display.visible,
      size: this.persist.display.size,
      right: this.persist.display.right,
      bottom: this.persist.display.bottom,
      name: this.persist.name,
    }).catch(() => {})
  }

  private rewardTurn(sessionId: string, turn: number): void {
    const last = this.rewardedTurns.get(sessionId) ?? 0
    if (turn <= last) return
    this.rewardedTurns.set(sessionId, turn)
    this.persist = { ...this.persist, affinity: applyTurnReward(this.persist.affinity, this.affinityConfig) }
    this.flush()
  }

  private affinityView(affinity: AffinityState): PetStateView['affinity'] {
    const nowMs = Date.now()
    const rank = rankOf(affinity.points, this.character.ranks)
    return {
      points: affinity.points,
      rank: rank.name,
      rankEmoji: rank.emoji,
      pets: affinity.pets,
      passes: affinity.passes,
      turns: affinity.turns,
      petCooldown: nowMs - affinity.lastPetAt < this.affinityConfig.petCooldownMs,
      passCooldown: nowMs - affinity.lastPassAt < this.affinityConfig.passCooldownMs,
    }
  }

  private flush(): void {
    try {
      savePetPersist(this.persist, this.persistDir)
    } catch {
      // Persistence is best-effort; the in-memory ledger keeps working.
    }
  }
}
