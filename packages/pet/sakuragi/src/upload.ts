/**
 * Upload helpers: generic file save/list under $DSH_HOME/slamdunk/. Backgrounds
 * live in one shared dir; pose images live in each pet's own directory (the
 * active pet's dir, managed by pets.ts).
 * @module @deepseek-ai/dsh-sakuragi/upload
 */

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { petHomeDir } from './persist.ts'

/** Root dir for uploaded skin assets. */
export function uploadRoot(): string {
  return join(petHomeDir(), 'slamdunk')
}

/** Shared dir for uploaded background images. */
export function backgroundsDir(): string {
  return join(uploadRoot(), 'backgrounds')
}

/** Sanitize a user-supplied filename to a safe basename (no path traversal). */
export function sanitizeName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? ''
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

/** Save one uploaded file into a directory; returns the stored filename. */
export function saveFile(dir: string, name: string, data: Buffer): string {
  mkdirSync(dir, { recursive: true })
  const safe = sanitizeName(name)
  if (safe === '') throw new Error('empty-filename')
  writeFileSync(join(dir, safe), data)
  return safe
}

/** List the filenames in a directory (sorted; empty when absent). */
export function listDir(dir: string): string[] {
  try {
    return readdirSync(dir).sort()
  } catch {
    return []
  }
}
