import type { GraphFilter } from '~/core/graph-explorer/graph-filter';

/**
 * Every empty state the explorer shows, worded for what was actually queried: the filter's spaces
 * and types, not the whole knowledge graph, unless the filter has no spaces.
 */
function where(filter: GraphFilter) {
  return filter.spaceIds ? 'in this topic’s spaces' : 'in the knowledge graph';
}

/** Types are always filtered (server-side, then client-side), so the copy always says so. */
export function relationshipsEmptyMessage(filter: GraphFilter): string {
  return `No relationships of the shown types ${where(filter)} yet.`;
}

export function claimsEmptyMessage(filter: GraphFilter, topicName: string | null): string {
  if (filter.claimsTopicId) return `No claims about this in ${topicName ?? 'this topic'} yet.`;
  return `No claims ${where(filter)} are linked to this yet.`;
}

/** The description is read in one space (`centreTextInSpace`), never borrowed from another. */
export function descriptionEmptyMessage(spaceId: string | null): string {
  return spaceId ? 'No description in this space yet.' : 'No description in the knowledge graph yet.';
}
