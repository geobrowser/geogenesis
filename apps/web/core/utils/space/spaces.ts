import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import type { Space } from '~/core/io/dto/spaces';
import { Entity } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

import { getTopRankedSpaceId } from './space-ranking';

export { getTopRankedSpaceId };

/**
 * A space has an "external" topic when its topicId points to a different
 * entity than the space's own page entity. Many spaces set their topic to
 * themselves (topicId === entity.id) which should be treated as no topic.
 *
 * ⚠️ **This cannot return true for a space whose topic resolved.** `SpaceDto`
 * builds `entity` from `topic ?? page`, so a space with a topic has
 * `entity.id === topicId` by construction, and this comparison is false. The
 * only way through it is a topic that *failed to decode* and fell back to the
 * page — exactly backwards from what the name promises. See
 * {@link hasTopicEntity}, and GEO-2913 for untangling the four callers.
 */
export const hasExternalTopic = (
  space: Pick<Space, 'topicId' | 'entity'> | null | undefined
): space is Pick<Space, 'topicId' | 'entity'> & { topicId: string } => {
  return Boolean(space?.topicId && space.topicId !== space.entity?.id);
};

/**
 * Whether this space is a person's, and has a person to render.
 *
 * **Asked of the entity, not of `topicId`.** `SpaceDto` builds `entity` from
 * `topic ?? page`, and a great many personal spaces carry a fully-populated
 * person on `page` with `topicId` still null — name, avatar, Person type and
 * all. Keying on `topicId` sent every one of those to the generic space page:
 * no rail, no history, and the raw properties table underneath.
 *
 * This is the same signal `buildSpaceTabs` branches on, which is the point.
 * The tabs and the profile disagreeing is exactly the failure it caused —
 * Debates, Positions and Proposals offered on a page that was not a profile.
 */
export function isPersonProfileSpace(space: Pick<Space, 'type' | 'entity'> | null | undefined): boolean {
  if (space?.type !== 'PERSONAL') return false;
  return (space.entity?.types ?? []).some(type => normId(type.id) === normId(SystemIds.PERSON_TYPE));
}

/** Entity at the root of a space's subtopic tree (homepage, or external topic). */
export function getSpaceSubtopicRootEntityId(space: Pick<Space, 'topicId' | 'entity'>): string {
  if (hasExternalTopic(space)) {
    return space.topicId;
  }

  return space.entity.id;
}

export const getValidSpaceIdForEntity = (entity: Entity) => {
  const validSpaces = entity?.spaces ?? [];
  return getTopRankedSpaceId(validSpaces);
};

export const getDeterministicSpaceId = (spaceIds: string[], preferredSpaceId?: string) => {
  if (spaceIds.length === 0) {
    return null;
  }

  if (preferredSpaceId && spaceIds.includes(preferredSpaceId)) {
    return preferredSpaceId;
  }

  return getTopRankedSpaceId(spaceIds);
};
