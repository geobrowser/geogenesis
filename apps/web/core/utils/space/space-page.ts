import { Graph, type Op, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { keccak256, stringToHex } from 'viem';

import type { Relation, Value } from '~/core/types';

/**
 * A space's own entity — its "page" — and what to do when it has none (GEO-2966).
 *
 * `space.page` is not stored anywhere. The API derives it (`public.spaces_page`) as the first
 * entity in the space carrying `Types -> Space`. A space whose creation never published that
 * relation has no page, and `SpaceEntityDto` stands in an entity with `id: ''` for it. The space
 * page then handed `''` to the editor as its entity id, every Name / Description / Types edit was
 * stored against `''`, and `prepareOps` dropped all of them — "your changes resolved to an empty
 * edit" for a diff the review screen was happily showing.
 *
 * The fix is the one the reporter proved by hand: give the page an id, and publish it with
 * `Types -> Space` so it becomes `space.page`. That can only happen with an editor's own
 * credentials — editorship is per space and on chain — so it happens as part of that editor's
 * first space-level publish rather than centrally.
 */

type SpaceLike = {
  id: string;
  entity: { id: string };
  topicId?: string | null;
};

/** True when the API resolved no page and no topic for this space. */
export function isPagelessSpace(space: SpaceLike): boolean {
  return space.entity.id === '';
}

/**
 * The id a pageless space's page is created at.
 *
 * Deterministic in the space id, not random, for two reasons. Local edits survive a reload: the
 * next render hands the editor the same id, so what the user already typed is still on the page.
 * And two editors repairing the same space at once converge on one page instead of creating two,
 * which `spaces_page` would then have to choose between.
 */
export function derivedSpacePageId(spaceId: string): string {
  return uuidFromSeed(`geo:space-page:${spaceId}`);
}

/**
 * The entity the space page should edit: the resolved page when there is one, else the space's
 * declared topic, else the derived page id. Never `''`.
 */
export function spacePageEntityId(space: SpaceLike): string {
  if (!isPagelessSpace(space)) return space.entity.id;
  return space.topicId || derivedSpacePageId(space.id);
}

/**
 * Rewrites a publish for a pageless space so it creates the page instead of dropping the edit.
 *
 * - Rows stored against `''` in this space are moved onto the page id. `''` is what
 *   `SpaceEntityDto` hands out for "this space's own entity", so that is what those rows meant;
 *   this rescues edits users made before the page id existed, which are still sitting in their
 *   local stores.
 * - When anything in the publish touches the page and nothing in it already types the page as a
 *   Space, a `Types -> Space` relation is added so the published entity becomes `space.page`. Its
 *   ids are derived too, so publishing twice before the indexer catches up does not stack
 *   duplicate type relations.
 *
 * Only row *contents* change; row ids are kept, so the caller can still mark exactly the rows it
 * was given as published.
 *
 * A space that already has a page is returned untouched.
 */
export function repairPagelessSpacePublish({
  space,
  values,
  relations,
}: {
  space: SpaceLike;
  values: Value[];
  relations: Relation[];
}): { values: Value[]; relations: Relation[]; pageOps: Op[] } {
  if (!isPagelessSpace(space)) return { values, relations, pageOps: [] };

  const spaceId = space.id;
  const pageId = spacePageEntityId(space);

  const repairedValues = values.map(v =>
    v.spaceId === spaceId && v.entity.id === '' ? { ...v, entity: { ...v.entity, id: pageId } } : v
  );

  const repairedRelations = relations.map(r =>
    r.spaceId === spaceId && r.fromEntity.id === '' ? { ...r, fromEntity: { ...r.fromEntity, id: pageId } } : r
  );

  const touchesPage =
    repairedValues.some(v => v.spaceId === spaceId && v.entity.id === pageId) ||
    repairedRelations.some(r => r.spaceId === spaceId && r.fromEntity.id === pageId);

  const alreadyTypedAsSpace = repairedRelations.some(
    r =>
      r.spaceId === spaceId &&
      !r.isDeleted &&
      r.fromEntity.id === pageId &&
      r.type.id === SystemIds.TYPES_PROPERTY &&
      r.toEntity.id === SystemIds.SPACE_TYPE
  );

  const pageOps =
    touchesPage && !alreadyTypedAsSpace
      ? Graph.createRelation({
          id: uuidFromSeed(`geo:space-page-type:${spaceId}:${pageId}`),
          entityId: uuidFromSeed(`geo:space-page-type-entity:${spaceId}:${pageId}`),
          fromEntity: pageId,
          type: SystemIds.TYPES_PROPERTY,
          toEntity: SystemIds.SPACE_TYPE,
        }).ops
      : [];

  return { values: repairedValues, relations: repairedRelations, pageOps };
}

/** A dashless v4-shaped UUID, stable for a given seed. */
function uuidFromSeed(seed: string): string {
  const hex = keccak256(stringToHex(seed)).slice(2, 34).split('');
  // Version nibble 4 and RFC 4122 variant, so the id reads as the same shape `IdUtils.generate`
  // produces.
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return hex.join('');
}
