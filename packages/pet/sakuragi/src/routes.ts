/**
 * Desktop-pet + theme HTTP routes — plain same-origin JSON endpoints
 * (`/api/sakuragi/*`) for state, interactions, pet/theme management and file
 * upload, plus static serving of pet poses and theme backgrounds from the
 * per-directory stores under $DSH_HOME/slamdunk/.
 * @module @deepseek-ai/dsh-sakuragi/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { PetQuotesPatch, PetService } from './service.ts'
import type { PetInteraction } from './affinity.ts'
import { sanitizeName, saveFile } from './upload.ts'
import { petsRoot, petPosesDir, petMusicDir } from './pets.ts'
import { themesRoot, themeBackgroundsDir } from './themes.ts'

/** Browser-facing base path of the pet API. */
export const PET_API_PREFIX = '/api/sakuragi'

/** Browser-facing base path of the pet asset routes. */
export const PET_ASSET_PREFIX = '/sakuragi'

/** Absolute package root, resolved from this module's own location (lib/). */
export function petPackageRoot(importMetaUrl: string): string {
  return fileURLToPath(new URL('../', importMetaUrl))
}

/** Write one JSON response. */
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Require the method or answer 405. */
function requireMethod(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (req.method === method) return true
  json(res, 405, { ok: false, error: 'method-not-allowed' })
  return false
}

/** Read a JSON request body (bounded). */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new Error('body-too-large'))
        queueMicrotask(() => req.destroy())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) { resolve({}); return }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new Error('invalid-json')) }
    })
    req.on('error', reject)
  })
}

/** Read a raw binary request body (bounded). */
function readRawBody(req: IncomingMessage, maxBytes = 8 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('body-too-large'))
        queueMicrotask(() => req.destroy())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => { resolve(Buffer.concat(chunks)) })
    req.on('error', reject)
  })
}

/** Content type by file extension. */
function contentTypeFor(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.svg')) return 'image/svg+xml'
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  if (n.endsWith('.webp')) return 'image/webp'
  if (n.endsWith('.gif')) return 'image/gif'
  if (n.endsWith('.mp3')) return 'audio/mpeg'
  if (n.endsWith('.ogg')) return 'audio/ogg'
  if (n.endsWith('.wav')) return 'audio/wav'
  if (n.endsWith('.m4a') || n.endsWith('.aac')) return 'audio/mp4'
  if (n.endsWith('.flac')) return 'audio/flac'
  if (n.endsWith('.mp4') || n.endsWith('.m4v')) return 'video/mp4'
  if (n.endsWith('.webm')) return 'video/webm'
  if (n.endsWith('.ogv')) return 'video/ogg'
  if (n.endsWith('.mov')) return 'video/quicktime'
  return 'application/octet-stream'
}

/** Serve any file under a base dir (prefix route; every path segment sanitized). */
function serveDir(basePath: string, root: () => string): WebRoute {
  return {
    kind: 'prefix',
    path: basePath,
    handler: (req, res): void => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405)
        res.end()
        return
      }
      const rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname.slice(basePath.length + 1))
      const segments = rel.split('/').map(sanitizeName).filter(s => s !== '')
      readFile(join(root(), ...segments)).then(body => {
        res.writeHead(200, {
          'content-type': contentTypeFor(segments[segments.length - 1] ?? ''),
          'content-length': String(body.byteLength),
          'cache-control': 'no-cache',
        })
        if (req.method === 'HEAD') { res.end(); return }
        res.end(body)
      }, () => {
        res.writeHead(404)
        res.end()
      })
    },
  }
}

/** Wrap one async service call as a GET JSON route. */
function getRoute(path: string, run: () => Promise<unknown>): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req, res): void => {
      if (!requireMethod(req, res, 'GET')) return
      run().then(
        value => json(res, 200, value),
        error => json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }),
      )
    },
  }
}

/** Wrap one async service call as a POST JSON route (body passed through). */
function postRoute(path: string, run: (body: Record<string, unknown>) => Promise<unknown>): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req, res): Promise<void> => {
      if (!requireMethod(req, res, 'POST')) return Promise.resolve()
      return readJsonBody(req).then(body => {
        const record = (typeof body === 'object' && body !== null) ? body as Record<string, unknown> : {}
        return run(record).then(
          value => json(res, 200, value),
          error => json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }),
        )
      }, error => json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }))
    },
  }
}

/** Build the full route family for one service. */
export function makePetRoutes(deps: { service: PetService }): WebRoute[] {
  const { service } = deps

  const apiRoutes: WebRoute[] = [
    getRoute(`${PET_API_PREFIX}/state`, () => service.state()),
    getRoute(`${PET_API_PREFIX}/backgrounds`, () => Promise.resolve({ backgrounds: service.themeBackgrounds() })),
    getRoute(`${PET_API_PREFIX}/pets`, () => Promise.resolve({ pets: service.pets() })),
    getRoute(`${PET_API_PREFIX}/themes`, () => Promise.resolve({ themes: service.themes() })),
    postRoute(`${PET_API_PREFIX}/interact`, (body) => {
      const kind = body.kind as PetInteraction | undefined
      if (kind !== 'pet' && kind !== 'pass') return Promise.reject(new Error('invalid-kind'))
      return service.interact(kind)
    }),
    postRoute(`${PET_API_PREFIX}/set-visible`, (body) => {
      const visible = body.visible
      if (typeof visible !== 'boolean') return Promise.reject(new Error('invalid-visible'))
      return service.setVisible(visible)
    }),
    postRoute(`${PET_API_PREFIX}/set-config`, (body) => service.setConfig({
      ...(typeof body.size === 'number' ? { size: body.size } : {}),
      ...(typeof body.right === 'number' ? { right: body.right } : {}),
      ...(typeof body.bottom === 'number' ? { bottom: body.bottom } : {}),
      ...(typeof body.visible === 'boolean' ? { visible: body.visible } : {}),
    })),
    postRoute(`${PET_API_PREFIX}/set-name`, (body) => {
      const name = body.name
      if (typeof name !== 'string') return Promise.reject(new Error('invalid-name'))
      return service.setName(name)
    }),
    postRoute(`${PET_API_PREFIX}/pets/create`, (body) => {
      const name = body.name
      if (typeof name !== 'string' || name.trim() === '') return Promise.reject(new Error('invalid-name'))
      return Promise.resolve({ id: service.createPet(name) })
    }),
    postRoute(`${PET_API_PREFIX}/pets/activate`, (body) => {
      const id = body.id
      if (typeof id !== 'string') return Promise.reject(new Error('invalid-id'))
      return service.activatePet(id)
    }),
    postRoute(`${PET_API_PREFIX}/themes/create`, (body) => {
      const name = body.name
      if (typeof name !== 'string' || name.trim() === '') return Promise.reject(new Error('invalid-name'))
      return Promise.resolve({ id: service.createTheme(name) })
    }),
    postRoute(`${PET_API_PREFIX}/themes/activate`, (body) => {
      const id = body.id
      if (typeof id !== 'string') return Promise.reject(new Error('invalid-id'))
      return service.activateTheme(id)
    }),
    postRoute(`${PET_API_PREFIX}/pets/config`, (body) => {
      const id = body.id
      if (typeof id !== 'string') return Promise.reject(new Error('invalid-id'))
      return service.petConfig(id)
    }),
    postRoute(`${PET_API_PREFIX}/pets/rename`, (body) => {
      const id = body.id
      const name = body.name
      if (typeof id !== 'string' || typeof name !== 'string') return Promise.reject(new Error('invalid-args'))
      return service.renamePet(id, name)
    }),
    postRoute(`${PET_API_PREFIX}/pets/quotes`, (body) => {
      const id = body.id
      const quotes = body.quotes
      if (typeof id !== 'string' || typeof quotes !== 'object' || quotes === null) return Promise.reject(new Error('invalid-args'))
      return service.updatePetQuotes(id, quotes as PetQuotesPatch)
    }),
    postRoute(`${PET_API_PREFIX}/pets/actions`, (body) => {
      const id = body.id
      const actions = body.actions as { pet?: unknown; pass?: unknown } | undefined
      if (typeof id !== 'string' || actions === undefined) return Promise.reject(new Error('invalid-args'))
      if (typeof actions.pet !== 'string' || typeof actions.pass !== 'string') return Promise.reject(new Error('invalid-args'))
      return service.updatePetActions(id, { pet: actions.pet, pass: actions.pass })
    }),
    postRoute(`${PET_API_PREFIX}/pets/music-toggle`, (body) => {
      const id = body.id
      const enabled = body.enabled
      if (typeof id !== 'string' || typeof enabled !== 'boolean') return Promise.reject(new Error('invalid-args'))
      return service.setPetMusicEnabled(id, enabled)
    }),
    postRoute(`${PET_API_PREFIX}/pets/delete`, (body) => {
      const id = body.id
      if (typeof id !== 'string') return Promise.reject(new Error('invalid-id'))
      return service.deletePet(id)
    }),
    postRoute(`${PET_API_PREFIX}/music/delete`, (body) => {
      const id = body.id
      const name = body.name
      if (typeof id !== 'string' || typeof name !== 'string') return Promise.reject(new Error('invalid-args'))
      return service.deleteMusic(id, name)
    }),
    postRoute(`${PET_API_PREFIX}/pets/pose-delete`, (body) => {
      const id = body.id
      const name = body.name
      if (typeof id !== 'string' || typeof name !== 'string') return Promise.reject(new Error('invalid-args'))
      return service.deletePetPose(id, name)
    }),
    postRoute(`${PET_API_PREFIX}/themes/config`, (body) => {
      const id = body.id
      if (typeof id !== 'string') return Promise.reject(new Error('invalid-id'))
      return service.themeConfig(id)
    }),
    postRoute(`${PET_API_PREFIX}/themes/rename`, (body) => {
      const id = body.id
      const name = body.name
      if (typeof id !== 'string' || typeof name !== 'string') return Promise.reject(new Error('invalid-args'))
      return service.renameTheme(id, name)
    }),
    postRoute(`${PET_API_PREFIX}/themes/delete`, (body) => {
      const id = body.id
      if (typeof id !== 'string') return Promise.reject(new Error('invalid-id'))
      return service.deleteTheme(id)
    }),
    postRoute(`${PET_API_PREFIX}/themes/background-delete`, (body) => {
      const id = body.id
      const name = body.name
      if (typeof id !== 'string' || typeof name !== 'string') return Promise.reject(new Error('invalid-args'))
      return service.deleteThemeBackground(id, name)
    }),
  ]

  const uploadRoute: WebRoute = {
    kind: 'exact',
    path: `${PET_API_PREFIX}/upload`,
    handler: (req, res): void => {
      if (!requireMethod(req, res, 'POST')) return
      const url = new URL(req.url ?? '/', 'http://x')
      const kind = url.searchParams.get('kind')
      const name = url.searchParams.get('name') ?? 'upload'
      const id = url.searchParams.get('id')
      if (kind !== 'background' && kind !== 'pose' && kind !== 'music') {
        json(res, 400, { ok: false, error: 'invalid-kind' })
        return
      }
      let dir: string
      if (kind === 'pose') {
        dir = id !== null ? petPosesDir(id) : service.petPosesDir()
      } else if (kind === 'music') {
        dir = id !== null ? petMusicDir(id) : service.petMusicDir()
      } else {
        dir = id !== null ? themeBackgroundsDir(id) : service.activeThemeBackgroundsDir()
      }
      readRawBody(req).then(body => {
        if (body.length === 0) {
          json(res, 400, { ok: false, error: 'empty-body' })
          return
        }
        const stored = saveFile(dir, name, body)
        if (kind === 'pose' && (id === null || id === service.petId())) service.reloadCharacter()
        json(res, 200, { ok: true, name: stored })
      }, error => {
        json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      })
    },
  }

  const characterRoute: WebRoute = {
    kind: 'exact',
    path: `${PET_ASSET_PREFIX}/character.json`,
    handler: (req, res): void => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405)
        res.end()
        return
      }
      readFile(join(petsRoot(), service.petId(), 'character.json')).then(body => {
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': String(body.byteLength),
          'cache-control': 'no-cache',
        })
        if (req.method === 'HEAD') { res.end(); return }
        res.end(body)
      }, () => {
        res.writeHead(404)
        res.end()
      })
    },
  }

  return [
    ...apiRoutes,
    uploadRoute,
    characterRoute,
    serveDir(`${PET_ASSET_PREFIX}/pets`, () => petsRoot()),
    serveDir(`${PET_ASSET_PREFIX}/themes`, () => themesRoot()),
  ]
}
