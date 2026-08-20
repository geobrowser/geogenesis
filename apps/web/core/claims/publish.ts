import { equals } from '~/core/id/normalize';
import type { Entity, Relation } from '~/core/types';

/**
 * A claim counts as published once none of its relations are still unpublished
 * local edits. Shared by the claims page and the entity-header debate button so
 * the two don't drift.
 */
export function isClaimPublished(claim: Entity): boolean {
  return isPublished(claim.relations);
}

/**
 * The same question asked of one space. A caller reading an entity unscoped holds every space's
 * relations, where a draft edit sitting in one space would report the claim unpublished everywhere
 * it is listed — so the space it is being debated in is the one that has to answer.
 *
 * Kept separate from {@link isClaimPublished} rather than added as an optional argument: the plain
 * form is passed straight to `Array.filter`, which would hand it the row index as a space.
 */
export function isClaimPublishedInSpace(claim: Entity, spaceId: string): boolean {
  // A relation carrying no space at all can't be placed, so it counts everywhere rather than
  // nowhere: dropping it would report a draft edit as published.
  return isPublished(claim.relations.filter(relation => !relation.spaceId || equals(relation.spaceId, spaceId)));
}

function isPublished(relations: Relation[]): boolean {
  return !relations.some(relation => relation.isLocal && relation.hasBeenPublished !== true);
}
