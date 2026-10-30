import { equals as idEquals } from '~/core/id/normalize';
import { compareBySpaceRank, compareTiedSpaceIds } from '~/core/utils/space/space-ranking';

import type { DebateAgendaSection, DebateAgendas } from './debate-agendas';

/**
 * GEO-3489. The order spaces' agendas are listed in: spaces both debaters are members of, then spaces
 * either one is, then the rest — each group by the space ranking, ties by id so the order is the same
 * on both debaters' screens.
 *
 * `debatersIn` answers how many of the two are members of a space: 2, 1 or 0.
 */
export function orderAgendaSpaces(spaceIds: string[], debatersIn: (spaceId: string) => number): string[] {
  const byRank = compareBySpaceRank<string>(spaceId => spaceId);
  return [...spaceIds].sort((a, b) => debatersIn(b) - debatersIn(a) || byRank(a, b) || compareTiedSpaceIds(a, b));
}

/**
 * Inside a section: claims nobody has debated since they were listed first, in the agenda's order,
 * then the debated ones, fewest debates first, keeping the agenda's order among equals.
 *
 * `debatesOf` answers undefined when the count is not known; such a claim is treated as undebated,
 * which is what an unknown claim on a new agenda most likely is.
 */
export function orderByDebatesSinceListing<T>(items: T[], debatesOf: (item: T) => number | undefined): T[] {
  return items
    .map((item, index) => ({ item, index, debates: debatesOf(item) ?? 0 }))
    .sort((a, b) => a.debates - b.debates || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * Today's claims order, section by section: spaces in `spaceOrder`, each space's sections in its
 * agenda's order, and inside each section {@link orderByDebatesSinceListing}. The one walk every
 * Today's claims surface lists from — the picker (GEO-3489) and the callout (GEO-3498) — so their
 * orders can't drift apart. Claims listed twice come back twice; dedupe is the caller's.
 */
export function todaysSectionsInOrder(
  spaces: DebateAgendas['spaces'],
  spaceOrder: string[],
  debatesOf: (claimId: string) => number | undefined
): Array<{ section: DebateAgendaSection; claimIds: string[] }> {
  return spaceOrder.flatMap(spaceId => {
    const space = spaces.find(candidate => idEquals(candidate.spaceId, spaceId));
    return (space?.sections ?? []).map(section => ({
      section,
      claimIds: orderByDebatesSinceListing(section.claimIds, debatesOf),
    }));
  });
}
