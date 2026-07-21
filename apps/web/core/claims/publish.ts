import type { Entity } from '~/core/types';

/**
 * A claim counts as published once none of its relations are still unpublished
 * local edits. Shared by the claims page and the entity-header debate button so
 * the two don't drift.
 */
export function isClaimPublished(claim: Entity): boolean {
  return !claim.relations.some(relation => relation.isLocal && relation.hasBeenPublished !== true);
}
