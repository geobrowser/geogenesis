import { normId } from '~/core/utils/norm-id';

/**
 * How a debate's first play opens (GEO-3578): on its most engaging moment, then the title card,
 * then the full debate from the start — or, as before, straight on the title card.
 *
 * On for everyone. `NEXT_PUBLIC_DEBATE_OPENING_CLIP=0` switches it off for everyone without a code
 * change.
 */
export const DEBATE_OPENING_CLIP_ENABLED = process.env.NEXT_PUBLIC_DEBATE_OPENING_CLIP !== '0';

/** What analytics reports as the play's `opening`. */
export type DebateOpening = 'moment' | 'title_card';

/**
 * Which opening this viewer gets for this debate.
 *
 * The one seam the split test (GEO-3580) replaces: give it the viewer's stable group and the player
 * follows, with nothing in the player itself to change. Takes the debate so a test split by debate
 * needs no new signature either.
 */
export function debateOpeningFor(_debateId: string): DebateOpening {
  return DEBATE_OPENING_CLIP_ENABLED ? 'moment' : 'title_card';
}

/**
 * Debates whose opening clip this browser has already played, so it is not shown again.
 *
 * Per browser, like `watched-debates.ts`, and plain `localStorage` behind try/catch for the same
 * reason: a module-level storage atom runs on import and breaks every suite that imports the player.
 */
const STORAGE_KEY = 'geogenesis.debates.opening-clip-seen.v1';

/** Oldest dropped past this. A clip seen hundreds of debates ago costs one repeat at most. */
const MAX_REMEMBERED = 500;

function readSeen(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function hasSeenOpeningClip(debateId: string): boolean {
  return readSeen().includes(normId(debateId));
}

export function markOpeningClipSeen(debateId: string): void {
  if (typeof window === 'undefined') return;
  const id = normId(debateId);
  try {
    // Most recent last, so trimming from the front forgets the oldest.
    const ids = readSeen().filter(existing => existing !== id);
    ids.push(id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-MAX_REMEMBERED)));
  } catch {
    // Quota or private mode: the clip may play again on this debate, which is all this prevents.
  }
}
