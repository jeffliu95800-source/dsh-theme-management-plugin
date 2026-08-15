/**
 * Character pack: one directory of data (character.json + poses/) that fully
 * defines a desktop-pet persona. Swapping characters = swapping this pack —
 * no code changes. The host loads it at boot and the browser half consumes it
 * through the state snapshot + `/sakuragi/character.json`.
 * @module @jeffliu95800/dsh-sakuragi/character
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** One chat rule: a case-insensitive regex source plus candidate replies. */
export interface ChatRule {
  match: string
  replies: string[]
}

/** One affinity rank. */
export interface CharacterRank {
  min: number
  name: string
  emoji: string
}

/** Ambient background-music config for one pet (files live in music/). */
export interface CharacterMusic {
  enabled: boolean
}

/** Labels of the two customizable interaction buttons. */
export interface CharacterActions {
  pet: string
  pass: string
}

/** Default interaction button labels. */
export const DEFAULT_ACTIONS: CharacterActions = { pet: '摸头', pass: '传球' }

/** Fully-typed character pack (character.json + auto-discovered poses). */
export interface CharacterPack {
  id: string
  name: string
  nameEn: string
  /** Phase → bubble line. */
  bubbles: Record<string, string>
  /** Interaction reactions (pet / pass + their cooldown variants). */
  reactions: { pet: string; petCooldown: string; pass: string; passCooldown: string }
  /** Interaction button labels (customizable; defaults when absent). */
  actions: CharacterActions
  ranks: CharacterRank[]
  chat: ChatRule[]
  fallback: string[]
  /** Regex source used to capture the user's name from an introduction. */
  namePattern: string
  /** Background-music config (defaults to disabled when absent). */
  music: CharacterMusic
  /** Pose SVG filenames, auto-discovered from assets/poses/. */
  poses: string[]
}

/** Image extensions accepted as character poses. */
const POSE_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif']

/** Load the character pack from a directory holding character.json + poses/. */
export function loadCharacterPack(dir: string, poseDir: string = 'poses'): CharacterPack {
  const parsed = JSON.parse(readFileSync(join(dir, 'character.json'), 'utf8')) as
    Omit<CharacterPack, 'poses' | 'music' | 'actions'>
    & { music?: Partial<CharacterMusic> | undefined; actions?: Partial<CharacterActions> | undefined }
  let poses: string[] = []
  try {
    poses = readdirSync(join(dir, poseDir))
      .filter(file => POSE_EXTENSIONS.some(ext => file.toLowerCase().endsWith(ext)))
      .sort()
  } catch {
    // pose dir absent → empty pose list
  }
  return {
    ...parsed,
    music: { enabled: parsed.music?.enabled ?? false },
    actions: { pet: parsed.actions?.pet ?? DEFAULT_ACTIONS.pet, pass: parsed.actions?.pass ?? DEFAULT_ACTIONS.pass },
    poses,
  }
}
