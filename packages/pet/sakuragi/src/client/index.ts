/**
 * Sakuragi pet browser half — renders the character and drives it from the
 * host's same-origin `/api/sakuragi/*` JSON endpoints: poll the host snapshot
 * (~800 ms), forward interactions, and keep a local-persona chat memory. The
 * pet registers into the shell's root-scoped `shell.overlay` slot (persistent
 * across sessions), and a visibility toggle registers into the General
 * settings item slot.
 * @module @deepseek-ai/dsh-client-ui-pet/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the shell.overlay SlotMap entry (ui-layout).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the settings.general.item SlotMap entry (ui-settings).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { Pet, type PetInjected } from './Pet.tsx'
import { PetSettingsRow, type PetSettingsInjected } from './SettingsRow.tsx'
import { createPetStore, type PetConfigView, type PetStateView, type PetSummary, type ThemeConfigView, type ThemeSummary } from './pet-store.ts'
import { respond, type CharacterChat, type PetFacts } from './persona.ts'
import { en, zh, type PetKey } from './locales.ts'

export type { PetKey } from './locales.ts'
export type { ChatMessage, PetFeedback, PetStateView, PetUiState } from './pet-store.ts'
export type { PetInjected } from './Pet.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    pet: PetKey
  }
}

/** Dictionary namespace. */
const NS = 'pet'

/** Poll interval for the host snapshot. */
const POLL_MS = 800

/** Same-origin JSON fetch helper (GET without body, POST with JSON body). */
async function petFetch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined
    ? {}
    : {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
  if (!response.ok) throw new Error(`sakuragi ${path} failed: ${response.status}`)
  return (await response.json()) as T
}

/** Required services. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register dictionaries, poll the host snapshot, mount the
 * pet into `shell.overlay`, and seat the visibility toggle in General settings.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-pet: dictionaries')

  const store = createPetStore()
  let bound: BoundActions<typeof store> | undefined
  const facts: PetFacts = {}
  // Character chat data (rules + fallback + name pattern), refetched whenever
  // the active pet changes.
  let characterChat: CharacterChat = { chat: [], fallback: [], namePattern: '.*' }
  const refreshCharacterChat = (): void => {
    petFetch<CharacterChat>('/sakuragi/character.json').then(character => {
      characterChat = character
    }, () => {})
  }
  refreshCharacterChat()

  const pollNow = (): void => {
    petFetch<PetStateView>('/api/sakuragi/state').then(snapshot => {
      bound?.setSnapshot(snapshot)
    }, () => {
      bound?.setState('error')
    })
  }

  const refreshLists = (): void => {
    petFetch<{ pets: PetSummary[] }>('/api/sakuragi/pets').then(r => { bound?.setPets(r.pets) }, () => {})
    petFetch<{ themes: ThemeSummary[] }>('/api/sakuragi/themes').then(r => { bound?.setThemes(r.themes) }, () => {})
  }

  /** Same-origin binary upload (POST raw body to a query-parameter route). */
  const petUpload = (path: string, data: Blob): Promise<void> => {
    return fetch(path, { method: 'POST', body: data }).then(response => {
      if (!response.ok) throw new Error(`sakuragi ${path} failed: ${response.status}`)
    })
  }

  const petInjected = (actions: BoundActions<typeof store>): PetInjected => {
    bound = actions
    pollNow()
    refreshLists()
    return {
      pet: () => {
        petFetch<{ reaction: string }>('/api/sakuragi/interact', { kind: 'pet' }).then(result => {
          actions.setFeedback({ text: result.reaction, at: Date.now() })
        }, () => {})
      },
      pass: () => {
        petFetch<{ reaction: string }>('/api/sakuragi/interact', { kind: 'pass' }).then(result => {
          actions.setFeedback({ text: result.reaction, at: Date.now() })
        }, () => {})
      },
      hide: () => {
        petFetch('/api/sakuragi/set-visible', { visible: false }).then(() => { pollNow() }, () => {})
      },
      summon: () => {
        petFetch('/api/sakuragi/set-visible', { visible: true }).then(() => { pollNow() }, () => {})
      },
      send: (text) => {
        const clean = text.trim()
        if (clean === '') return
        const now = Date.now()
        actions.addMessage({ role: 'user', text: clean, at: now })
        const reply = respond(clean, facts, characterChat)
        actions.addMessage({ role: 'pet', text: reply, at: now + 1 })
        actions.setFeedback({ text: reply, at: now })
      },
      clear: () => { actions.clearMessages() },
      feedbackDone: () => { actions.setFeedback(null) },
      dragEnd: (right, bottom) => {
        petFetch('/api/sakuragi/set-config', { right, bottom }).then(() => { pollNow() }, () => {})
      },
    }
  }

  const settingsInjected = (actions: BoundActions<typeof store>): PetSettingsInjected => {
    bound = actions
    return {
    setVisible: (visible: boolean) => {
      petFetch('/api/sakuragi/set-visible', { visible }).then(() => { pollNow() }, () => {})
    },
    createPet: (name: string) => {
      petFetch('/api/sakuragi/pets/create', { name }).then(() => { refreshLists() }, () => {})
    },
    activatePet: (id: string) => {
      petFetch('/api/sakuragi/pets/activate', { id }).then(() => {
        refreshLists()
        refreshCharacterChat()
        pollNow()
      }, () => {})
    },
    createTheme: (name: string) => {
      petFetch('/api/sakuragi/themes/create', { name }).then(() => { refreshLists() }, () => {})
    },
    activateTheme: (id: string) => {
      petFetch('/api/sakuragi/themes/activate', { id }).then(() => { refreshLists() }, () => {})
    },
    getPetConfig: (id: string) => petFetch<PetConfigView>('/api/sakuragi/pets/config', { id }),
    renamePet: (id: string, name: string) => petFetch('/api/sakuragi/pets/rename', { id, name })
      .then(() => { refreshLists(); refreshCharacterChat(); pollNow() }),
    updatePetQuotes: (id: string, quotes: { bubbles?: Record<string, string>; reactions?: Record<string, string> }) =>
      petFetch('/api/sakuragi/pets/quotes', { id, quotes }).then(() => { refreshCharacterChat(); pollNow() }),
    setPetMusicEnabled: (id: string, enabled: boolean) =>
      petFetch('/api/sakuragi/pets/music-toggle', { id, enabled }).then(() => { pollNow() }),
    deletePet: (id: string) => petFetch('/api/sakuragi/pets/delete', { id })
      .then(() => { refreshLists(); refreshCharacterChat(); pollNow() }),
    uploadPetAsset: (kind: 'pose' | 'music', id: string, name: string, data: Blob) =>
      petUpload(`/api/sakuragi/upload?kind=${kind}&id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`, data)
        .then(() => { pollNow(); if (kind === 'pose') refreshCharacterChat() }),
    deleteMusic: (id: string, name: string) =>
      petFetch('/api/sakuragi/music/delete', { id, name }).then(() => { pollNow() }),
    getThemeConfig: (id: string) => petFetch<ThemeConfigView>('/api/sakuragi/themes/config', { id }),
    renameTheme: (id: string, name: string) => petFetch('/api/sakuragi/themes/rename', { id, name })
      .then(() => { refreshLists() }),
    deleteTheme: (id: string) => petFetch('/api/sakuragi/themes/delete', { id })
      .then(() => { refreshLists() }),
    uploadThemeBackground: (id: string, name: string, data: Blob) =>
      petUpload(`/api/sakuragi/upload?kind=background&id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`, data),
    }
  }

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'sakuragi-pet',
    order: 100,
    store,
    locale: NS,
    inject: petInjected,
  }, Pet))

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'sakuragi-pet',
    order: 90,
    store,
    locale: NS,
    inject: settingsInjected,
  }, PetSettingsRow))

  // Poll only while the plugin is enabled and the tab is visible.
  ctx.effect(() => {
    let timer: number | undefined
    const stop = (): void => { if (timer !== undefined) { window.clearInterval(timer); timer = undefined } }
    const start = (): void => { if (timer === undefined && document.visibilityState === 'visible') timer = window.setInterval(pollNow, POLL_MS) }
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') { pollNow(); start() } else { stop() }
    }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, 'ui-pet: poll')
}
