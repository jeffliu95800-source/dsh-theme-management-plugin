/**
 * Package-owned invariant companion for `@jeffliu95800/dsh-sakuragi`.
 * @module @jeffliu95800/dsh-sakuragi/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@jeffliu95800/dsh-sakuragi'

/** Cordis companion plugin name. */
export const name = 'sakuragi-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the service owns only in-memory state plus a private
 * JSON file, and emits no cordis events; the session-event wiring and route
 * registration are asserted by the webserver's own route-disposer invariant.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
