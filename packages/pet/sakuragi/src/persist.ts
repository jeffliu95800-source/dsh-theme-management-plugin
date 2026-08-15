/**
 * Persistence for the Sakuragi pet: display config, affinity, and name, written
 * as JSON under $DSH_HOME (defaults to ~/.dsh). Missing or corrupt files fall
 * back to defaults; writes are atomic (temp + rename).
 * @module @deepseek-ai/dsh-sakuragi/persist
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { emptyAffinity, type AffinityState } from './affinity.ts'

/** Display configuration the user can tweak. */
export interface PetDisplayConfig {
  /** Master switch. */
  visible: boolean
  /** Rendered pet height in px. */
  size: number
  /** Inset from the viewport right edge, px. */
  right: number
  /** Inset from the viewport bottom edge, px. */
  bottom: number
}

export const defaultDisplayConfig: PetDisplayConfig = {
  visible: true,
  size: 180,
  right: 24,
  bottom: 20,
}

/** Display value bounds. */
export const DISPLAY_SIZE_MIN = 64
export const DISPLAY_SIZE_MAX = 512
export const DISPLAY_INSET_MAX = 10_000

/** Everything persisted for the pet. */
export interface PetPersist {
  /** User-customizable pet display name. */
  name: string
  /** Affinity ledger. */
  affinity: AffinityState
  /** Display configuration. */
  display: PetDisplayConfig
}

/** Default pet name (fallback when the character pack is absent). */
export const DEFAULT_PET_NAME = '宠物'

/** Name constraints. */
export const PET_NAME_MAX_LENGTH = 20

export function emptyPersist(defaultName: string = DEFAULT_PET_NAME): PetPersist {
  return {
    name: defaultName,
    affinity: emptyAffinity(),
    display: { ...defaultDisplayConfig },
  }
}

/** Resolve the persistence directory ($DSH_HOME or ~/.dsh). */
export function petHomeDir(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** Numeric field guard: finite numbers only, else the fallback. */
function finiteNum(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Clamp one value into [0, max]. */
function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(0, value))
}

/** Load persisted state; missing or corrupt files fall back to defaults. */
export function loadPetPersist(dir: string = petHomeDir(), defaultName: string = DEFAULT_PET_NAME): PetPersist {
  try {
    const raw = readFileSync(join(dir, 'sakuragi-pet.json'), 'utf8')
    const parsed = JSON.parse(raw) as Partial<PetPersist>
    const base = emptyPersist(defaultName)
    const rawAffinity = (parsed.affinity ?? {}) as Partial<AffinityState>
    const affinity: AffinityState = {
      points: clamp(finiteNum(rawAffinity.points, 0), 100),
      lastPetAt: clamp(finiteNum(rawAffinity.lastPetAt, 0), Number.MAX_SAFE_INTEGER),
      lastPassAt: clamp(finiteNum(rawAffinity.lastPassAt, 0), Number.MAX_SAFE_INTEGER),
      pets: clamp(finiteNum(rawAffinity.pets, 0), Number.MAX_SAFE_INTEGER),
      passes: clamp(finiteNum(rawAffinity.passes, 0), Number.MAX_SAFE_INTEGER),
      turns: clamp(finiteNum(rawAffinity.turns, 0), Number.MAX_SAFE_INTEGER),
    }
    const rawDisplay = (parsed.display ?? {}) as Partial<PetDisplayConfig>
    const display: PetDisplayConfig = {
      visible: typeof rawDisplay.visible === 'boolean' ? rawDisplay.visible : base.display.visible,
      size: Math.round(Math.min(DISPLAY_SIZE_MAX, Math.max(DISPLAY_SIZE_MIN, finiteNum(rawDisplay.size, base.display.size)))),
      right: Math.round(clamp(finiteNum(rawDisplay.right, base.display.right), DISPLAY_INSET_MAX)),
      bottom: Math.round(clamp(finiteNum(rawDisplay.bottom, base.display.bottom), DISPLAY_INSET_MAX)),
    }
    return {
      name: typeof parsed.name === 'string' && parsed.name.trim() !== '' ? parsed.name : base.name,
      affinity,
      display,
    }
  } catch {
    return emptyPersist()
  }
}

/** Atomically persist state (write temp + rename). */
export function savePetPersist(data: PetPersist, dir: string = petHomeDir()): void {
  mkdirSync(dir, { recursive: true })
  const target = join(dir, 'sakuragi-pet.json')
  const tmp = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, target)
}
