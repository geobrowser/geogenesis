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
  /** Any of these (OR): a debate is usually tagged with one or two topics, so AND would empty the list. */
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
    return Boolean(display?.topics.some(topic => topics.has(normId(topic.id))));
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
