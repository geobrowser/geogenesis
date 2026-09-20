import type { HistoryCard, HistoryEntry } from './normalize-history';

/**
 * How many roles or degrees a section shows before offering the rest.
 *
 * Counted in rows rather than in organisations. Two cards was the earlier rule
 * and it showed almost nothing: somebody with one role at each of two companies
 * got two lines and a "Show all" under them, which is a control doing the work
 * the section was supposed to do.
 */
const LIMIT = 5;

/**
 * The cards a section shows collapsed.
 *
 * **An organisation is all-or-nothing.** A card is one company with its roles
 * beneath it, and showing three of somebody's four titles at one employer reads
 * as a gap in their history rather than as a list that continues — so the limit
 * decides which *companies* make the cut, counting the rows they bring.
 *
 * The first card is always shown, however many roles it carries. Somebody with a
 * six-role run at one employer would otherwise open to nothing at all, and the
 * alternative — cutting that run — is the thing above that must not happen.
 */
export function visibleHistoryCards<T extends HistoryCard<HistoryEntry>>(cards: T[], limit = LIMIT): T[] {
  const shown: T[] = [];
  let rows = 0;

  for (const card of cards) {
    const next = rows + card.entries.length;

    // Past the limit, and not the first: stop rather than take a partial card.
    if (shown.length > 0 && next > limit) break;

    shown.push(card);
    rows = next;
  }

  return shown;
}
