/**
 * Multi-pet management. Two on-disk layouts, selected by `materialRoot`:
 *
 * - legacy (default, `$DSH_HOME/slamdunk/`): every pet is a directory
 *   `pets/<id>/` holding `character.json` + `poses/` (+ `music/`).
 * - library (`materialRoot`, e.g. a "dsh theme" material folder): every
 *   subfolder of the root is one theme+character combo — `model/` holds the
 *   pose images, `music/` the background music, and a `character.json` is
 *   synthesized on first scan (name = folder name). Each folder doubles as a
 *   theme (`img/` = wallpapers), see themes.ts.
 *
 * The bundled Sakuragi is seeded on first run, so every pet — built-in or
 * user-created — is a plain editable directory and the active one is just a
 * persisted selection. Swapping = pick another id.
 * @module @jeffliu95800/dsh-sakuragi/pets
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadCharacterPack, type CharacterPack } from './character.ts'
import { petHomeDir } from './persist.ts'
import { sanitizeName } from './upload.ts'

/** Id of the bundled seed pet. */
export const BUILTIN_PET_ID = 'sakuragi'

/** One pet as the settings surface lists it. */
export interface PetSummary {
  id: string
  name: string
  active: boolean
}

/** Configured material-library root; undefined keeps the legacy layout. */
let materialRoot: string | undefined

/** Point the pet/theme stores at a material-library folder (or reset to legacy). */
export function setMaterialRoot(root: string | undefined): void {
  materialRoot = root
}

/** True when the material-library layout is active. */
export function isLibraryMode(): boolean {
  return materialRoot !== undefined
}

/** Pose directory name per layout: `model/` in the library, `poses/` in legacy. */
export function poseDirName(): 'model' | 'poses' {
  return materialRoot === undefined ? 'poses' : 'model'
}

export function petsRoot(): string {
  return materialRoot ?? join(petHomeDir(), 'slamdunk', 'pets')
}

/** One pet's directory (its id is the folder name in both layouts). */
export function petDir(id: string): string {
  return join(petsRoot(), id)
}

function activePetFile(): string {
  return join(petHomeDir(), 'slamdunk', 'active-pet.json')
}

/** Default persona pack for a newly created / synthesized pet. */
function defaultPack(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name: name || '新宠物',
    nameEn: 'New Pet',
    bubbles: {},
    reactions: { pet: '……', petCooldown: '……', pass: '……', passCooldown: '……' },
    actions: { pet: '摸头', pass: '传球' },
    ranks: [{ min: 0, name: '伙伴', emoji: '*' }],
    chat: [],
    fallback: ['……'],
    namePattern: '.*',
    music: { enabled: false },
  }
}

/** Write a missing character.json into every material-library subfolder. */
export function ensureLibraryMeta(): void {
  if (!isLibraryMode()) return
  try {
    for (const name of readdirSync(petsRoot())) {
      // The built-in default THEME folder is not a character — skip it.
      if (name === 'default') continue
      const dir = join(petsRoot(), name)
      if (!statSync(dir).isDirectory()) continue
      if (!existsSync(join(dir, 'character.json'))) {
        writeFileSync(join(dir, 'character.json'), JSON.stringify(defaultPack(name, name), null, 2))
      }
    }
  } catch {
    // root absent → nothing to ensure
  }
}

/** Seed the bundled Sakuragi into the pets root on first run. */
export function seedBuiltinPet(packageRoot: string): void {
  const dir = petDir(BUILTIN_PET_ID)
  if (existsSync(join(dir, 'character.json'))) return
  const posesDir = join(dir, poseDirName())
  mkdirSync(posesDir, { recursive: true })
  copyFileSync(join(packageRoot, 'assets', 'character.json'), join(dir, 'character.json'))
  for (const file of readdirSync(join(packageRoot, 'assets', 'poses'))) {
    if (file.endsWith('.svg')) copyFileSync(join(packageRoot, 'assets', 'poses', file), join(posesDir, file))
  }
}

/** Ids of all pets (directories holding a character.json), sorted. */
export function listPetIds(): string[] {
  ensureLibraryMeta()
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
    const name = (JSON.parse(readFileSync(join(petDir(id), 'character.json'), 'utf8')) as { name?: string }).name
    if (typeof name === 'string' && name !== '') return name
  } catch {
    // fall through
  }
  return id
}

/** The full character pack for one pet id. */
export function loadPet(id: string): CharacterPack {
  return loadCharacterPack(petDir(id), poseDirName())
}

/** One pet's poses directory (pose upload target). */
export function petPosesDir(id: string): string {
  return join(petDir(id), poseDirName())
}

/** One pet's background-music directory. */
export function petMusicDir(id: string): string {
  return join(petDir(id), 'music')
}

/** Image extensions accepted as character poses. */
const POSE_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif']

/** Names of pose files soft-deleted (hidden but kept on disk). */
function softDeletedPoses(id: string): Set<string> {
  try {
    const raw = JSON.parse(readFileSync(join(petDir(id), 'character.json'), 'utf8')) as { deletedPoses?: unknown }
    const list = Array.isArray(raw.deletedPoses) ? raw.deletedPoses.filter((n): n is string => typeof n === 'string') : []
    return new Set(list)
  } catch {
    return new Set()
  }
}

/** Pose image filenames for one pet (sorted; soft-deleted ones hidden). */
export function listPoseFiles(id: string): string[] {
  const deleted = softDeletedPoses(id)
  try {
    return readdirSync(petPosesDir(id))
      .filter(file => POSE_EXTENSIONS.some(ext => file.toLowerCase().endsWith(ext)))
      .filter(file => !deleted.has(file))
      .sort()
  } catch {
    return []
  }
}

/** Soft-delete a pose: keep the file, just hide it from listings. */
export function softDeletePose(id: string, name: string): boolean {
  const raw = readPetJson(id)
  const current = (raw.deletedPoses as string[] | undefined) ?? []
  if (current.includes(name)) return false
  writePetJson(id, { ...raw, deletedPoses: [...current, name] })
  return true
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
  writeFileSync(join(petDir(id), 'character.json'), JSON.stringify(next, null, 2))
}

/** Read a pet's character.json as a mutable record. */
function readPetJson(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(petDir(id), 'character.json'), 'utf8')) as Record<string, unknown>
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

/** Replace a pet's interaction button labels (empty values fall back to defaults). */
export function updatePetActions(id: string, actions: { pet: string; pass: string }): void {
  const raw = readPetJson(id)
  const existing = raw.actions as { pet?: string; pass?: string } | undefined
  writePetJson(id, {
    ...raw,
    actions: {
      pet: actions.pet.trim() || existing?.pet?.trim() || '摸头',
      pass: actions.pass.trim() || existing?.pass?.trim() || '传球',
    },
  })
}

/** Delete a pet directory; when it was active the selection falls back to the built-in. */
export function deletePet(id: string): void {
  const wasActive = activePetId() === id
  rmSync(petDir(id), { recursive: true, force: true })
  if (wasActive) setActivePetId(BUILTIN_PET_ID)
}

/** The currently active pet id (falls back to the built-in, then the first pet). */
export function activePetId(): string {
  try {
    const raw = JSON.parse(readFileSync(activePetFile(), 'utf8')) as { id?: string }
    if (typeof raw.id === 'string' && existsSync(join(petDir(raw.id), 'character.json'))) return raw.id
  } catch {
    // fall through
  }
  const ids = listPetIds()
  if (ids.includes(BUILTIN_PET_ID)) return BUILTIN_PET_ID
  return ids[0] ?? BUILTIN_PET_ID
}

/** Persist the active pet id. */
export function setActivePetId(id: string): void {
  mkdirSync(join(petHomeDir(), 'slamdunk'), { recursive: true })
  writeFileSync(activePetFile(), JSON.stringify({ id }))
}

/** Create a new pet from a persona name; returns its id. */
export function createPet(name: string): string {
  if (isLibraryMode()) {
    const id = sanitizeName(name.trim()) || 'pet'
    const dir = petDir(id)
    mkdirSync(join(dir, poseDirName()), { recursive: true })
    writeFileSync(join(dir, 'character.json'), JSON.stringify(defaultPack(id, name.trim()), null, 2))
    return id
  }
  const slug = (name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase().replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'pet').slice(0, 24)
  const id = `${slug}-${Date.now()}`
  const dir = petDir(id)
  mkdirSync(join(dir, poseDirName()), { recursive: true })
  writeFileSync(join(dir, 'character.json'), JSON.stringify(defaultPack(id, name.trim()), null, 2))
  return id
}

/** List all pets with active flag (settings surface). */
export function listPets(): PetSummary[] {
  const active = activePetId()
  return listPetIds().map(id => ({ id, name: petName(id), active: id === active }))
}
