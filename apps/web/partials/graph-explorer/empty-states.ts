import type { GraphFilter } from '~/core/graph-explorer/graph-filter';

/** Every empty state the explorer shows, worded for what was actually queried. */
export function claimsEmptyMessage(filter: GraphFilter, topicName: string | null): string {
  if (filter.claimsTopicId) return `No claims about this in ${topicName ?? 'this topic'} yet.`;
  return 'No claims in the knowledge graph are linked to this yet.';
}
