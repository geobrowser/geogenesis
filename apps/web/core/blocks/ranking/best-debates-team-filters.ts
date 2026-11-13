import { normId } from '~/core/utils/norm-id';

/**
 * The Best debates ranking screen's team column tools (All and To rank alike): search, a topic
 * filter and grouping by space. Pure, over the rows' display data, so the screen's lists and the
 * menu's counts come from one rule.
 */
export type TeamFilterDisplay = {
  title: string;
  space: { id: string; name: string; image: string | null } | null;
  topics: readonly { id: string; name: string }[];
};

export type TeamFilters = {
  query: string;
  /**
   * Every one of these (AND), as the Debates panel's Claims tab filters topics (GEO-2696): the
   * menu's counts are then co-occurrence, so nothing it offers can lead to an empty list.
   */
  topicIds: readonly string[];
};

export type DisplayLookup = (entityId: string) => TeamFilterDisplay | null | undefined;

function matchesQuery(query: string, display: TeamFilterDisplay | null | undefined, fallbackName: string | null) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [display?.title, fallbackName, display?.space?.name].filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every(word => haystack.includes(word));
}

/** The ids that pass the search and the topic filter, in their order. */
export function filterTeamIds(
  ids: readonly string[],
  displayOf: DisplayLookup,
  filters: TeamFilters,
  nameOf: (entityId: string) => string | null = () => null
): string[] {
  const topics = new Set(filters.topicIds.map(normId));
  return ids.filter(id => {
    const display = displayOf(id);
    if (!matchesQuery(filters.query, display, nameOf(id))) return false;
    if (topics.size === 0) return true;
    const carried = new Set((display?.topics ?? []).map(topic => normId(topic.id)));
    return [...topics].every(topic => carried.has(topic));
  });
}

export type TopicOption = { id: string; name: string; count: number };

/** The topics present in a list, with how many of its debates carry each; most used first. */
export function topicOptions(ids: readonly string[], displayOf: DisplayLookup): TopicOption[] {
  const byId = new Map<string, TopicOption>();
  for (const id of ids) {
    for (const topic of displayOf(id)?.topics ?? []) {
      const key = normId(topic.id);
      const option = byId.get(key) ?? { id: key, name: topic.name, count: 0 };
      option.count += 1;
      byId.set(key, option);
    }
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export type SpaceGroup = {
  /** Null for the debates whose space isn't known (yet). */
  space: { id: string; name: string; image: string | null } | null;
  ids: string[];
};

/**
 * Groups a list by each debate's own space. Groups come in the order their first debate appears,
 * so the best-placed space leads, and rows keep the list's order inside a group. Debates whose
 * space isn't known go last. Empty groups never appear: a group exists only once it has a row.
 */
export function groupBySpace(ids: readonly string[], displayOf: DisplayLookup): SpaceGroup[] {
  const groups = new Map<string, SpaceGroup>();
  const unknown: string[] = [];
  for (const id of ids) {
    const space = displayOf(id)?.space ?? null;
    if (!space) {
      unknown.push(id);
      continue;
    }
    const key = normId(space.id);
    const group = groups.get(key) ?? { space, ids: [] };
    group.ids.push(id);
    groups.set(key, group);
  }
  const out = [...groups.values()];
  if (unknown.length > 0) out.push({ space: null, ids: unknown });
  return out;
}

/**
 * The topic counts for To rank: over the whole To rank set (every debate fetched for it, not the
 * rows drawn so far), narrowed by the search and the picked topics as the list is. Null while any
 * debate in the set has no display data yet, so a partial count is never shown as the count.
 */
export function toRankTopicCounts(
  ids: readonly string[],
  displayOf: DisplayLookup,
  filters: TeamFilters,
  nameOf: (entityId: string) => string | null = () => null
): TopicOption[] | null {
  if (ids.some(id => !displayOf(id))) return null;
  return topicOptions(filterTeamIds(ids, displayOf, filters, nameOf), displayOf);
}

/**
 * The entity filter for the All / By space topic counts: every Debate (the Best debates block's
 * own filter, Types is Debate), the search on the debate's name, and one clause per picked topic.
 * Counted on the server over the whole set, as the Claims tab's topic facet is.
 */
export function teamTopicFacetEntityFilter({
  debateTypeId,
  typesPropertyId,
  topicsPropertyId,
  query,
  topicIds,
}: {
  debateTypeId: string;
  typesPropertyId: string;
  topicsPropertyId: string;
  query: string;
  topicIds: readonly string[];
}) {
  // The type as a Types relation rather than `typeIds`: under a relation aggregate's `fromEntity`
  // the `typeIds` clause isn't promoted to the indexed path and the request times out on testnet
  // (measured 12 Nov); the relation form answers in well under a second.
  const and = [
    { relations: { some: { typeId: { is: typesPropertyId }, toEntityId: { is: debateTypeId } } } },
    ...teamSearchEntityClauses({ topicsPropertyId, query, topicIds }),
  ];
  return { and };
}

/** The search words and picked topics as entity clauses, for the facet and the full matching list. */
export function teamSearchEntityClauses({
  topicsPropertyId,
  query,
  topicIds,
}: {
  topicsPropertyId: string;
  query: string;
  topicIds: readonly string[];
}): Record<string, unknown>[] {
  const and: Record<string, unknown>[] = [];
  for (const word of query.trim().split(/\s+/).filter(Boolean)) {
    and.push({ name: { includesInsensitive: word } });
  }
  for (const topicId of topicIds) {
    and.push({ relations: { some: { typeId: { is: topicsPropertyId }, toEntityId: { is: topicId } } } });
  }
  return and;
}

/**
 * A fully read filtered list in the team column's order: team places first, in place order, then
 * the unplaced, newest first.
 */
export function orderMatchingDebates(
  debates: readonly { entityId: string; createdAtMs: number }[],
  rankOf: (entityId: string) => number | undefined
): { ranked: string[]; unranked: string[] } {
  const ranked: { id: string; rank: number }[] = [];
  const unranked: { id: string; createdAtMs: number }[] = [];
  for (const debate of debates) {
    const rank = rankOf(debate.entityId);
    if (rank != null) ranked.push({ id: debate.entityId, rank });
    else unranked.push({ id: debate.entityId, createdAtMs: debate.createdAtMs });
  }
  ranked.sort((a, b) => a.rank - b.rank);
  unranked.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return { ranked: ranked.map(row => row.id), unranked: unranked.map(row => row.id) };
}
