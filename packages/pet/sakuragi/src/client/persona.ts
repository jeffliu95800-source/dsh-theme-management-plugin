/**
 * Generic character persona engine: keyword-triggered responses driven by the
 * character pack's chat rules (data), plus a small facts memory so the pet can
 * recall the user's name across turns. Swapping characters = swapping the
 * chat/fallback/namePattern data; this module has no persona baked in.
 */

/** Facts the pet picks up across turns (kept small and lossy on purpose). */
export interface PetFacts {
  /** The user's name, captured from a first-person introduction. */
  userName?: string
}

/** One chat rule from the character pack. */
export interface ChatRule {
  /** Case-insensitive regex source matched against the user text. */
  match: string
  /** Candidate replies; one is picked (optionally with a name greeting). */
  replies: string[]
}

/** The chat-driving subset of a character pack. */
export interface CharacterChat {
  chat: ChatRule[]
  fallback: string[]
  /** Regex source used to capture the user's name from an introduction. */
  namePattern: string
}

/** Name-insertion slot a rule may use. */
const NAME_SLOT = '{name}'

/** Empty fallback so respond never returns undefined. */
const EMPTY: readonly string[] = ['……']

/**
 * Pick one reply for the user's message from the character's chat rules,
 * updating the pet's facts.
 * @param text - the user's latest message.
 * @param facts - mutable pet facts carried across turns.
 * @param character - the character pack's chat data.
 * @returns the pet's reply text.
 */
export function respond(text: string, facts: PetFacts, character: CharacterChat): string {
  const trimmed = text.trim()
  const nameMatch = new RegExp(character.namePattern).exec(trimmed)
  const captured = nameMatch?.[1]
  if (captured !== undefined) facts.userName = captured

  const name = facts.userName ?? ''
  for (const rule of character.chat) {
    if (!new RegExp(rule.match, 'i').test(trimmed)) continue
    const reply = rule.replies[Math.floor(Math.random() * rule.replies.length)] ?? rule.replies[0] ?? ''
    return reply.replace(NAME_SLOT, name)
  }
  const fallback = character.fallback.length > 0 ? character.fallback : EMPTY
  return fallback[Math.floor(Math.random() * fallback.length)] ?? ''
}
