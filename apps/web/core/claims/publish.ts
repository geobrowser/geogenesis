import { equals } from '~/core/id/normalize';
import type { Entity } from '~/core/types';

/**
 * Whether a claim is published in one space — that is, whether none of the relations it holds
 * *there* are still unpublished local edits.
 *
 * Always asked of a space, never of the claim alone. Callers read claims unscoped (`store.getEntity`
 * without a `spaceId`, `useQueryEntities`, which has no space option at all), so they hold every
 * space's relations at once, and a draft edit sitting in one space would report the claim
 * unpublished everywhere it is listed. The space it is being debated in is the one that has to
 * answer.
 *
 * Note the argument order: this takes the space second, so passing it bare to `Array.filter` would
 * hand it the row index as a space. Wrap it in a closure over the space instead.
 */
export function isClaimPublishedInSpace(claim: Entity, spaceId: string): boolean {
  // A relation carrying no space at all can't be placed, so it counts everywhere rather than
  // nowhere: dropping it would report a draft edit as published.
  const inSpace = claim.relations.filter(relation => !relation.spaceId || equals(relation.spaceId, spaceId));
  return !inSpace.some(relation => relation.isLocal && relation.hasBeenPublished !== true);
}
