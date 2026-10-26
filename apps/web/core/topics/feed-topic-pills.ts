import { normId } from '~/core/utils/norm-id';

import type { TopicOption } from './use-topic-suggestions';

const nameKey = (topic: TopicOption) => topic.name.trim().toLowerCase();

/**
 * Search results while there is a query, else suggestions; picks missing from the list go first.
 * One pill per name, like the backend: a hit named like a suggestion or pick takes that topic's id.
 */
export function buildTopicPills({
  suggestions,
  searchResults,
  hasQuery,
  selected,
}: {
  suggestions: readonly TopicOption[];
  searchResults: readonly TopicOption[];
  hasQuery: boolean;
  selected: readonly TopicOption[];
}): TopicOption[] {
  const known = new Map<string, TopicOption>();
  for (const topic of [...selected, ...suggestions]) {
    if (!known.has(nameKey(topic))) known.set(nameKey(topic), topic);
  }

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const listed: TopicOption[] = [];
  for (const hit of hasQuery ? searchResults : suggestions) {
    const topic = known.get(nameKey(hit)) ?? hit;
    const id = normId(topic.id);
    if (seenIds.has(id) || seenNames.has(nameKey(topic))) continue;
    seenIds.add(id);
    seenNames.add(nameKey(topic));
    listed.push(topic);
  }

  const missingPicks = selected.filter(topic => !seenIds.has(normId(topic.id)) && !seenNames.has(nameKey(topic)));
  return [...missingPicks, ...listed];
}
