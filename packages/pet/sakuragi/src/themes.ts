/**
 * Multi-theme management. Two on-disk layouts, selected by `materialRoot`:
 *
 * - legacy (default, `$DSH_HOME/slamdunk/`): each theme is a directory
 *   `themes/<id>/` holding `theme.json` + `backgrounds/`.
 * - library (`materialRoot`, a "dsh theme" material folder): every subfolder
 *   is one theme+character combo — `img/` holds the wallpaper images, and a
 *   `theme.json` is synthesized on first scan (name = folder name). The same
 *   folder doubles as a pet (see pets.ts).
 *
 * The built-in "default" theme is seeded empty — the AppFrame falls back to
 * the bundled wallpapers when the active theme has no backgrounds. Switching
 * = pick another id.
 * @module @jeffliu95800/dsh-sakuragi/themes
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { petHomeDir } from './persist.ts'
import { isLibraryMode, petsRoot } from './pets.ts'
import { sanitizeName } from './upload.ts'

/** Id of the built-in (empty) default theme. */
export const BUILTIN_THEME_ID = 'default'

/** One theme as the settings surface lists it. */
export interface ThemeSummary {
  id: string
  name: string
  active: boolean
}

/** Theme root: the shared material library when configured, else the legacy dir. */
export function themesRoot(): string {
  return isLibraryMode() ? petsRoot() : join(petHomeDir(), 'slamdunk', 'themes')
}

/** Backgrounds directory name per layout: `img/` in the library, `backgrounds/` in legacy. */
export function backgroundDirName(): 'img' | 'backgrounds' {
  return isLibraryMode() ? 'img' : 'backgrounds'
}

/** One theme's directory (its id is the folder name in both layouts). */
function themeDir(id: string): string {
  return join(themesRoot(), id)
}

function activeThemeFile(): string {
  return join(petHomeDir(), 'slamdunk', 'active-theme.json')
}

/** Write a missing theme.json into every material-library subfolder. */
export function ensureLibraryMeta(): void {
  if (!isLibraryMode()) return
  try {
    for (const name of readdirSync(themesRoot())) {
      // The built-in sakuragi CHARACTER folder is not a theme — skip it.
      if (name === 'sakuragi') continue
      const dir = join(themesRoot(), name)
      if (!statSync(dir).isDirectory()) continue
      if (!existsSync(join(dir, 'theme.json'))) {
        writeFileSync(join(dir, 'theme.json'), JSON.stringify({ id: name, name, nameEn: name }, null, 2))
      }
    }
  } catch {
    // root absent → nothing to ensure
  }
}

/** Seed the built-in default theme (no backgrounds) on first run. */
export function seedBuiltinTheme(): void {
  const dir = themeDir(BUILTIN_THEME_ID)
  if (existsSync(join(dir, 'theme.json'))) return
  mkdirSync(join(dir, backgroundDirName()), { recursive: true })
  writeFileSync(join(dir, 'theme.json'), JSON.stringify({ id: BUILTIN_THEME_ID, name: '默认主题', nameEn: 'Default' }, null, 2))
}

/** Ids of all themes (directories holding a theme.json), sorted. */
export function listThemeIds(): string[] {
  ensureLibraryMeta()
  try {
    return readdirSync(themesRoot())
      .filter(id => existsSync(join(themesRoot(), id, 'theme.json')))
      .sort()
  } catch {
    return []
  }
}

/** A theme's display name (falls back to its id). */
export function themeName(id: string): string {
  try {
    const name = (JSON.parse(readFileSync(join(themeDir(id), 'theme.json'), 'utf8')) as { name?: string }).name
    if (typeof name === 'string' && name !== '') return name
  } catch {
    // fall through
  }
  return id
}

/** The currently active theme id (defaults to the built-in). */
export function activeThemeId(): string {
  try {
    const raw = JSON.parse(readFileSync(activeThemeFile(), 'utf8')) as { id?: string }
    if (typeof raw.id === 'string' && existsSync(join(themeDir(raw.id), 'theme.json'))) return raw.id
  } catch {
    // fall through
  }
  const ids = listThemeIds()
  if (ids.includes(BUILTIN_THEME_ID)) return BUILTIN_THEME_ID
  return ids[0] ?? BUILTIN_THEME_ID
}

/** Persist the active theme id. */
export function setActiveThemeId(id: string): void {
  mkdirSync(join(petHomeDir(), 'slamdunk'), { recursive: true })
  writeFileSync(activeThemeFile(), JSON.stringify({ id }))
}

/** Backgrounds directory for one theme. */
export function themeBackgroundsDir(id: string): string {
  return join(themeDir(id), backgroundDirName())
}

/** Image + video extensions accepted as wallpapers. */
const BACKGROUND_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.mp4', '.m4v', '.webm', '.ogv', '.mov']

/** Names of background files soft-deleted (hidden but kept on disk). */
function softDeletedBackgrounds(id: string): Set<string> {
  try {
    const raw = JSON.parse(readFileSync(join(themeDir(id), 'theme.json'), 'utf8')) as { deletedBackgrounds?: unknown }
    const list = Array.isArray(raw.deletedBackgrounds) ? raw.deletedBackgrounds.filter((n): n is string => typeof n === 'string') : []
    return new Set(list)
  } catch {
    return new Set()
  }
}

/** Background media filenames for one theme (images + videos; soft-deleted hidden). */
export function listThemeBackgrounds(id: string): string[] {
  const deleted = softDeletedBackgrounds(id)
  try {
    return readdirSync(themeBackgroundsDir(id))
      .filter(file => BACKGROUND_EXTENSIONS.some(ext => file.toLowerCase().endsWith(ext)))
      .filter(file => !deleted.has(file))
      .sort()
  } catch {
    return []
  }
}

/** Soft-delete a background: keep the file, just hide it from listings. */
export function softDeleteBackground(id: string, name: string): boolean {
  const dir = themeDir(id)
  const raw = JSON.parse(readFileSync(join(dir, 'theme.json'), 'utf8')) as Record<string, unknown>
  const current = (raw.deletedBackgrounds as string[] | undefined) ?? []
  if (current.includes(name)) return false
  writeFileSync(join(dir, 'theme.json'), JSON.stringify({ ...raw, deletedBackgrounds: [...current, name] }, null, 2))
  return true
}

/** Create a new theme from a name; returns its id. */
export function createTheme(name: string): string {
  if (isLibraryMode()) {
    const id = sanitizeName(name.trim()) || 'theme'
    const dir = themeDir(id)
    mkdirSync(join(dir, backgroundDirName()), { recursive: true })
    writeFileSync(join(dir, 'theme.json'), JSON.stringify({ id, name: name.trim() || '新主题', nameEn: 'New Theme' }, null, 2))
    return id
  }
  const slug = (name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase().replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'theme').slice(0, 24)
  const id = `${slug}-${Date.now()}`
  const dir = themeDir(id)
  mkdirSync(join(dir, backgroundDirName()), { recursive: true })
  writeFileSync(join(dir, 'theme.json'), JSON.stringify({ id, name: name.trim() || '新主题', nameEn: 'New Theme' }, null, 2))
  return id
}

/** Rename a theme (display name shown in the settings list). */
export function renameTheme(id: string, name: string): void {
  const raw = JSON.parse(readFileSync(join(themeDir(id), 'theme.json'), 'utf8')) as Record<string, unknown>
  writeFileSync(join(themeDir(id), 'theme.json'), JSON.stringify({ ...raw, name: name.trim() }, null, 2))
}

/** Delete a theme; when it was active the selection falls back to the built-in. */
export function deleteTheme(id: string): void {
  const wasActive = activeThemeId() === id
  rmSync(themeDir(id), { recursive: true, force: true })
  if (wasActive) {
    seedBuiltinTheme()
    setActiveThemeId(BUILTIN_THEME_ID)
  }
}

/** List all themes with active flag (settings surface). */
export function listThemes(): ThemeSummary[] {
  const active = activeThemeId()
  return listThemeIds().map(id => ({ id, name: themeName(id), active: id === active }))
}
