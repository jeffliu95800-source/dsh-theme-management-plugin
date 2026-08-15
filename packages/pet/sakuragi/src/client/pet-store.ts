/**
 * Browser-side pet store: the host snapshot plus transient reaction feedback
 * and the local chat memory. The host snapshot and feedback are written only
 * by the apply-body poll/interactions; chat memory persists to localStorage
 * through the store's actions so the pet remembers across reloads.
 * @module @deepseek-ai/dsh-client-ui-pet/client/pet-store
 */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** Host state snapshot (mirrors the /api/sakuragi/state payload). */
export interface PetStateView {
  phase: 'idle' | 'waiting' | 'thinking' | 'tool' | 'done'
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
  display: { visible: boolean; size: number; right: number; bottom: number }
  name: string
  /** Pose SVG filenames served under /sakuragi/poses/. */
  poses: string[]
  /** Background music served under /sakuragi/pets/<id>/music/. */
  music: { enabled: boolean; files: string[] }
}

/** One pet's editable config returned by the edit endpoint. */
export interface PetConfigView {
  id: string
  name: string
  /** Phase → bubble line (non-interaction quotes). */
  bubbles: Record<string, string>
  /** Interaction reactions (button-click quotes). */
  reactions: { pet: string; petCooldown: string; pass: string; passCooldown: string }
  fallback: string[]
  /** Pose image URL paths. */
  poses: string[]
  /** Background-music state and file URL paths. */
  music: { enabled: boolean; files: string[] }
}

/** One theme's editable config returned by the edit endpoint. */
export interface ThemeConfigView {
  id: string
  name: string
  /** Background image URL paths. */
  backgrounds: string[]
}

/** One transient reaction bubble on the pet. */
export interface PetFeedback {
  text: string
  at: number
}

/** One chat turn. */
export interface ChatMessage {
  role: 'user' | 'pet'
  text: string
  at: number
}

/** One pet in the settings list. */
export interface PetSummary {
  id: string
  name: string
  active: boolean
}

/** One theme in the settings list. */
export interface ThemeSummary {
  id: string
  name: string
  active: boolean
}

/** Pet UI state as consumers see it. */
export interface PetUiState {
  /** Latest host snapshot; null before the first successful fetch. */
  snapshot: PetStateView | null
  /** Fetch lifecycle. */
  state: 'loading' | 'ready' | 'error'
  /** Active reaction bubble, if any. */
  feedback: PetFeedback | null
  /** Conversation memory, oldest first. */
  messages: ChatMessage[]
  /** Pets for the settings surface. */
  pets: PetSummary[]
  /** Themes for the settings surface. */
  themes: ThemeSummary[]
}

/** Store write set. */
export type PetUiActions = {
  setSnapshot: (draft: PetUiState, snapshot: PetStateView) => void
  setState: (draft: PetUiState, state: PetUiState['state']) => void
  setFeedback: (draft: PetUiState, feedback: PetFeedback | null) => void
  addMessage: (draft: PetUiState, message: ChatMessage) => void
  clearMessages: (draft: PetUiState) => void
  setPets: (draft: PetUiState, pets: PetSummary[]) => void
  setThemes: (draft: PetUiState, themes: ThemeSummary[]) => void
}

const MEMORY_KEY = 'dsh.sakuragi.chat.v1'
const MAX_MESSAGES = 200

/** Load persisted chat memory; tolerant of corrupt/absent storage. */
function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as ChatMessage[]
    return Array.isArray(parsed) ? parsed.slice(-MAX_MESSAGES) : []
  } catch {
    return []
  }
}

function saveMessages(messages: readonly ChatMessage[]): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)))
  } catch {
    // Storage failures (private mode, quota) only disable persistence.
  }
}

/** Create the pet store handle (apply world only; never module-level). */
export function createPetStore(): EngineStoreHandle<PetUiState, PetUiActions> {
  return defineStore({
    init: (): PetUiState => ({
      snapshot: null,
      state: 'loading',
      feedback: null,
      messages: loadMessages(),
      pets: [],
      themes: [],
    }),
    actions: {
      setSnapshot: (d, snapshot) => { d.snapshot = snapshot; d.state = 'ready' },
      setState: (d, state) => { d.state = state },
      setFeedback: (d, feedback) => { d.feedback = feedback },
      addMessage: (d, message) => {
        d.messages.push(message)
        if (d.messages.length > MAX_MESSAGES) d.messages = d.messages.slice(-MAX_MESSAGES)
        saveMessages(d.messages)
      },
      clearMessages: (d) => { d.messages = []; saveMessages(d.messages) },
      setPets: (d, pets) => { d.pets = pets },
      setThemes: (d, themes) => { d.themes = themes },
    },
  })
}
