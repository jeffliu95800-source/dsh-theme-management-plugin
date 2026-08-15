/**
 * Affinity score for the desktop pet — pure, clock-injected. The pet grows
 * closer the more you work together and interact: completed turns, head-pats,
 * and ball-passes all earn points. Reaction copy and ranks come from the
 * character pack (data), never hardcoded here. Persistence lives in the
 * service; this module only computes transitions.
 * @module @jeffliu95800/dsh-sakuragi/affinity
 */

import type { CharacterRank } from './character.ts'

/** One interaction the user can perform on the pet. */
export type PetInteraction = 'pet' | 'pass'

/** Reaction copy for one interaction kind, including its cooldown variant. */
export interface PetReactions {
  pet: string
  petCooldown: string
  pass: string
  passCooldown: string
}

/** Affinity state as persisted. */
export interface AffinityState {
  /** Total affinity points, capped at AFFINITY_MAX. */
  points: number
  /** Epoch ms of the last head-pat. */
  lastPetAt: number
  /** Epoch ms of the last ball-pass. */
  lastPassAt: number
  /** Total head-pat count (lifetime). */
  pets: number
  /** Total ball-pass count (lifetime). */
  passes: number
  /** Total completed turns witnessed (lifetime). */
  turns: number
}

export const AFFINITY_MAX = 100

/** Fallback ranks when no character pack supplies its own. */
export const AFFINITY_RANKS: readonly CharacterRank[] = [
  { min: 0, name: '伙伴', emoji: '*' },
  { min: 50, name: '挚友', emoji: '**' },
]

/** Interaction tuning (points / ms). */
export interface AffinityConfig {
  turnReward: number
  petReward: number
  petCooldownMs: number
  passReward: number
  passCooldownMs: number
}

export const defaultAffinityConfig: AffinityConfig = {
  turnReward: 1,
  petReward: 1,
  petCooldownMs: 10_000,
  passReward: 5,
  passCooldownMs: 30_000,
}

export function emptyAffinity(): AffinityState {
  return { points: 0, lastPetAt: 0, lastPassAt: 0, pets: 0, passes: 0, turns: 0 }
}

/** Rank for a point total (ranks supplied by the character pack). */
export function rankOf(points: number, ranks: readonly CharacterRank[] = AFFINITY_RANKS): CharacterRank {
  let rank = ranks[0] ?? AFFINITY_RANKS[0]!
  for (const candidate of ranks) {
    if (points >= candidate.min) rank = candidate
  }
  return rank
}

function clamp(points: number): number {
  return Math.min(AFFINITY_MAX, Math.max(0, points))
}

/** Outcome of one interaction. */
export interface InteractionOutcome {
  affinity: AffinityState
  delta: number
  reaction: string
  accepted: boolean
}

/**
 * Apply one interaction to a copy of the state (immutable style). Cooldowns
 * only apply after the first interaction of that kind (last*At === 0 means
 * "never", so the first one always lands). Reaction copy comes from the
 * character pack's reactions.
 */
export function applyInteraction(
  state: AffinityState,
  kind: PetInteraction,
  nowMs: number,
  reactions: PetReactions,
  config: AffinityConfig = defaultAffinityConfig,
): InteractionOutcome {
  const next = { ...state }
  if (kind === 'pet') {
    if (state.lastPetAt !== 0 && nowMs - state.lastPetAt < config.petCooldownMs) {
      return { affinity: state, delta: 0, reaction: reactions.petCooldown, accepted: false }
    }
    next.lastPetAt = nowMs
    next.pets += 1
    next.points = clamp(state.points + config.petReward)
    return { affinity: next, delta: config.petReward, reaction: reactions.pet, accepted: true }
  }
  if (state.lastPassAt !== 0 && nowMs - state.lastPassAt < config.passCooldownMs) {
    return { affinity: state, delta: 0, reaction: reactions.passCooldown, accepted: false }
  }
  next.lastPassAt = nowMs
  next.passes += 1
  next.points = clamp(state.points + config.passReward)
  return { affinity: next, delta: config.passReward, reaction: reactions.pass, accepted: true }
}

/** Reward one completed turn (called by the host on `done`). */
export function applyTurnReward(
  state: AffinityState,
  config: AffinityConfig = defaultAffinityConfig,
): AffinityState {
  const next = { ...state }
  next.turns += 1
  next.points = clamp(state.points + config.turnReward)
  return next
}
