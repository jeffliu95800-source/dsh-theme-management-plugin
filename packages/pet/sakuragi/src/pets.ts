/**
 * Multi-pet management: every pet is a directory under
 * $DSH_HOME/slamdunk/pets/<id>/ holding `character.json` + `poses/`. The
 * bundled Sakuragi is seeded there on first run, so every pet — built-in or
 * user-created — is a plain editable directory and the active one is just a
 * persisted selection. Swapping = pick another id.
 * @module @deepseek-ai/dsh-sakuragi/pets
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadCharacterPack, type CharacterPack } from './character.ts'
import { petHomeDir } from './persist.ts'

/** Id of the bundled seed pet. */
export const BUILTIN_PET_ID = 'sakuragi'

/** One pet as the settings surface lists it. */
export interface PetSummary {
  id: string
  name: string
  active: boolean
}

export function petsRoot(): string {
  return join(petHomeDir(), 'slamdunk', 'pets')
}

function activePetFile(): string {
  return join(petHomeDir(), 'slamdunk', 'active-pet.json')
}

/** Seed the bundled Sakuragi into the user pets dir on first run. */
export function seedBuiltinPet(packageRoot: string): void {
  const dir = join(petsRoot(), BUILTIN_PET_ID)
  if (existsSync(join(dir, 'character.json'))) return
  mkdirSync(join(dir, 'poses'), { recursive: true })
  copyFileSync(join(packageRoot, 'assets', 'character.json'), join(dir, 'character.json'))
  for (const file of readdirSync(join(packageRoot, 'assets', 'poses'))) {
    if (file.endsWith('.svg')) copyFileSync(join(packageRoot, 'assets', 'poses', file), join(dir, 'poses', file))
  }
}

/** Ids of all pets (directories holding a character.json), sorted. */
export function listPetIds(): string[] {
  try {
    return readdirSync(petsRoot())
      .filter(id => existsSync(join(petsRoot(), id, 'character.json')))
      .sort()
  } catch {
    return []
  }
}

/** A pet's display name (falls back to its id). */
export function petName(id: string): string {
  try {
    const name = (JSON.parse(readFileSync(join(petsRoot(), id, 'character.json'), 'utf8')) as { name?: string }).name
    if (typeof name === 'string' && name !== '') return name
  } catch {
    // fall through
  }
  return id
}

/** The full character pack for one pet id. */
export function loadPet(id: string): CharacterPack {
  return loadCharacterPack(join(petsRoot(), id))
}

/** One pet's poses directory (pose upload target). */
export function petPosesDir(id: string): string {
  return join(petsRoot(), id, 'poses')
}

/** One pet's background-music directory. */
export function petMusicDir(id: string): string {
  return join(petsRoot(), id, 'music')
}

/** Background-music filenames for one pet (sorted; empty when absent). */
export function listMusicFiles(id: string): string[] {
  try {
    return readdirSync(petMusicDir(id)).sort()
  } catch {
    return []
  }
}

/** Rewrite a pet's character.json, preserving unknown fields. */
function writePetJson(id: string, next: Record<string, unknown>): void {
  writeFileSync(join(petsRoot(), id, 'character.json'), JSON.stringify(next, null, 2))
}

/** Read a pet's character.json as a mutable record. */
function readPetJson(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(petsRoot(), id, 'character.json'), 'utf8')) as Record<string, unknown>
}

/** Rename a pet (persona name shown in lists and on the floating pet). */
export function renamePet(id: string, name: string): void {
  writePetJson(id, { ...readPetJson(id), name: name.trim() })
}

/** Replace a pet's phase bubbles and/or interaction reactions. */
export function updatePetQuotes(
  id: string,
  patch: { bubbles?: Record<string, string>; reactions?: Record<string, string> },
): void {
  const raw = readPetJson(id)
  const next = { ...raw }
  if (patch.bubbles !== undefined) next.bubbles = { ...(raw.bubbles as Record<string, string> ?? {}), ...patch.bubbles }
  if (patch.reactions !== undefined) next.reactions = { ...(raw.reactions as Record<string, string> ?? {}), ...patch.reactions }
  writePetJson(id, next)
}

/** Set whether a pet's background music is enabled. */
export function setPetMusicEnabled(id: string, enabled: boolean): void {
  const raw = readPetJson(id)
  const music = raw.music as { enabled?: boolean } | undefined
  writePetJson(id, { ...raw, music: { ...(music ?? {}), enabled } })
}

/** Delete a pet directory; when it was active the selection falls back to the built-in. */
export function deletePet(id: string): void {
  const wasActive = activePetId() === id
  rmSync(join(petsRoot(), id), { recursive: true, force: true })
  if (wasActive) setActivePetId(BUILTIN_PET_ID)
}

/** The currently active pet id (defaults to the built-in). */
export function activePetId(): string {
  try {
    const raw = JSON.parse(readFileSync(activePetFile(), 'utf8')) as { id?: string }
    if (typeof raw.id === 'string' && existsSync(join(petsRoot(), raw.id, 'character.json'))) return raw.id
  } catch {
    // fall through
  }
  return BUILTIN_PET_ID
}

/** Persist the active pet id. */
export function setActivePetId(id: string): void {
  mkdirSync(join(petHomeDir(), 'slamdunk'), { recursive: true })
  writeFileSync(activePetFile(), JSON.stringify({ id }))
}

/** Create a new pet from a persona name; returns its id. */
export function createPet(name: string): string {
  const slug = (name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase().replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'pet').slice(0, 24)
  const id = `${slug}-${Date.now()}`
  const dir = join(petsRoot(), id)
  mkdirSync(join(dir, 'poses'), { recursive: true })
  const pack = {
    id,
    name: name.trim() || '新宠物',
    nameEn: 'New Pet',
    bubbles: {},
    reactions: { pet: '……', petCooldown: '……', pass: '……', passCooldown: '……' },
    ranks: [{ min: 0, name: '伙伴', emoji: '*' }],
    chat: [],
    fallback: ['……'],
    namePattern: '.*',
    music: { enabled: false },
  }
  writeFileSync(join(dir, 'character.json'), JSON.stringify(pack, null, 2))
  return id
}

/** List all pets with active flag (settings surface). */
export function listPets(): PetSummary[] {
  const active = activePetId()
  return listPetIds().map(id => ({ id, name: petName(id), active: id === active }))
}
