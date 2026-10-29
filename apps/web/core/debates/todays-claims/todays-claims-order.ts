import { compareBySpaceRank, compareTiedSpaceIds } from '~/core/utils/space/space-ranking';

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
