/**
 * Multi-theme management: each theme is a directory under
 * $DSH_HOME/slamdunk/themes/<id>/ holding `theme.json` + `backgrounds/` (the
 * wallpaper images). The built-in "default" theme is seeded empty — the
 * AppFrame falls back to the bundled wallpapers when the active theme has no
 * backgrounds. Switching = pick another id.
 * @module @deepseek-ai/dsh-sakuragi/themes
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { petHomeDir } from './persist.ts'

/** Id of the built-in (empty) default theme. */
export const BUILTIN_THEME_ID = 'default'

/** One theme as the settings surface lists it. */
export interface ThemeSummary {
  id: string
  name: string
  active: boolean
}

export function themesRoot(): string {
  return join(petHomeDir(), 'slamdunk', 'themes')
}

function activeThemeFile(): string {
  return join(petHomeDir(), 'slamdunk', 'active-theme.json')
}

/** Seed the built-in default theme (no backgrounds) on first run. */
export function seedBuiltinTheme(): void {
  const dir = join(themesRoot(), BUILTIN_THEME_ID)
  if (existsSync(join(dir, 'theme.json'))) return
  mkdirSync(join(dir, 'backgrounds'), { recursive: true })
  writeFileSync(join(dir, 'theme.json'), JSON.stringify({ id: BUILTIN_THEME_ID, name: '默认主题', nameEn: 'Default' }, null, 2))
}

/** Ids of all themes (directories holding a theme.json), sorted. */
export function listThemeIds(): string[] {
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
    const name = (JSON.parse(readFileSync(join(themesRoot(), id, 'theme.json'), 'utf8')) as { name?: string }).name
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
    if (typeof raw.id === 'string' && existsSync(join(themesRoot(), raw.id, 'theme.json'))) return raw.id
  } catch {
    // fall through
  }
  return BUILTIN_THEME_ID
}

/** Persist the active theme id. */
export function setActiveThemeId(id: string): void {
  mkdirSync(join(petHomeDir(), 'slamdunk'), { recursive: true })
  writeFileSync(activeThemeFile(), JSON.stringify({ id }))
}

/** Backgrounds directory for one theme. */
export function themeBackgroundsDir(id: string): string {
  return join(themesRoot(), id, 'backgrounds')
}

/** Background filenames for one theme (sorted). */
export function listThemeBackgrounds(id: string): string[] {
  try {
    return readdirSync(themeBackgroundsDir(id)).sort()
  } catch {
    return []
  }
}

/** Create a new theme from a name; returns its id. */
export function createTheme(name: string): string {
  const slug = (name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'theme').slice(0, 24)
  const id = `${slug}-${Date.now()}`
  const dir = join(themesRoot(), id)
  mkdirSync(join(dir, 'backgrounds'), { recursive: true })
  writeFileSync(join(dir, 'theme.json'), JSON.stringify({ id, name: name.trim() || '新主题', nameEn: 'New Theme' }, null, 2))
  return id
}

/** List all themes with active flag (settings surface). */
export function listThemes(): ThemeSummary[] {
  const active = activeThemeId()
  return listThemeIds().map(id => ({ id, name: themeName(id), active: id === active }))
}
