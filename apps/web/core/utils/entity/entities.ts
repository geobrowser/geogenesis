import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { HIDDEN_PROPERTIES, OG_IMAGE_PROPERTY } from '~/core/constants';
import { EntityId } from '~/core/io/substream-schema';
import { Relation, Value } from '~/core/types';
import { isRenderableImageSrc } from '~/core/utils/image-src';
import { getSpaceRank, sortSpaceIdsByRank } from '~/core/utils/space/space-ranking';

/**
 * This function traverses through all the triples of an Entity and attempts to find the
 * description of the entity.
 *
 * We assume that the Description triple's attribute for an Entity will match the expected
 * system Description attribute ID at SystemIds.DESCRIPTION_PROPERTY. However, anybody can
 * set up a triple that references _any_ attribute whose name is "Description."
 *
 * We currently handle this in the UI by checking the system ID for Description as well
 * as any attribute whose name is "Description."
 *
 * We currently only handle description triples whose value is a StringValue. If the value
 * is an EntityValue we assume it's not valid and don't attempt to parse it to render in the UI.
 */
export function description(values: Value[]): string | null {
  const value = descriptionTriple(values);
  return value?.value ?? null;
}

export function descriptionTriple(values: Value[]): Value | undefined {
  return values.find(value => value.property.id === SystemIds.DESCRIPTION_PROPERTY);
}

/**
 * This function traverses through all the triples associated with an entity and attempts
 * to find the name of the entity.
 */
export function name(values: Value[]): string | null {
  const value = nameValue(values);
  return value?.value ?? null;
}

export function nameValue(values: Value[]): Value | undefined {
  const nameValues = values.filter(value => value.property.id === SystemIds.NAME_PROPERTY);
  if (nameValues.length <= 1) return nameValues[0];

  // Skip empty names, then pick from the highest-ranked space
  const nonEmpty = nameValues.filter(v => v.value);
  const candidates = nonEmpty.length > 0 ? nonEmpty : nameValues;
  return candidates.sort((a, b) => getSpaceRank(a.spaceId) - getSpaceRank(b.spaceId))[0];
}

/**
 * This function traverses through all the relations associated with an entity and attempts to find the avatar URL of the entity.
 */
export function avatar(relations?: Relation[]): string | null {
  if (!relations) return null;
  const avatarRelation = relations.find(r => r.type.id === EntityId(ContentIds.AVATAR_PROPERTY));
  if (!avatarRelation) return null;
  // For now, return the relation value directly since we can't use hooks in utility functions
  // The calling components should handle fetching the actual image URL
  return avatarRelation.toEntity.value ?? null;
}

/**
 * This function traverses through all the relations associated with an entity and attempts to find the cover URL of the entity.
 */
export function cover(relations?: Relation[]): string | null {
  if (!relations) return null;
  const coverRelation = relations.find(r => r.type.id === EntityId(SystemIds.COVER_PROPERTY));
  if (!coverRelation) return null;
  // For now, return the relation value directly since we can't use hooks in utility functions
  // The calling components should handle fetching the actual image URL
  return coverRelation.toEntity.value ?? null;
}

/**
 * The image to put on a share card, in the order an entity would want it chosen.
 *
 * OG Image first, because it is the only one of the three actually chosen for this job — a cover is
 * framed to sit behind a page and an avatar to read at 20px, and a 600x315 card in someone else's
 * feed is neither. Cover and then avatar behind it, unchanged, so an entity that has never heard of
 * the new property shares exactly as it did before; `generateOgImage` still supplies the default
 * card when all three are absent.
 *
 * Read like `cover` because it is shaped like `cover`: relation-typed, pointing at an Image entity
 * that carries the URL.
 */
export function ogImage(relations?: Relation[]): string | null {
  if (!relations) return null;
  const ogImageRelation = relations.find(r => r.type.id === EntityId(OG_IMAGE_PROPERTY));
  if (!ogImageRelation) return null;
  // `RelationDtoLive` fills `toEntity.value` from the *target*: the IPFS URL when the target is an
  // Image, and the target's own entity id when it is not. Checking `renderableType` is what tells
  // those two apart — without it, an OG Image pointed at some ordinary entity would hand a bare id
  // to the card as though it were a URL.
  if (ogImageRelation.renderableType !== 'IMAGE') return null;
  return usableImageUrl(ogImageRelation.toEntity.value);
}

/**
 * Guards the ways a relation can name no usable image.
 *
 * Empty is not hypothetical: `RelationDtoLive` writes `''` whenever the target resolves as an Image
 * but carries no `IMAGE_URL_PROPERTY` yet, which is what an upload mid-flight looks like. And `??`
 * falls through on null but *not* on `''`, so an OG Image in that state at the front of the chain
 * would shadow a cover that works and put a broken card on every share of the entity — setting the
 * property badly would be worse than never having set it.
 *
 * Nor is "non-empty" the same as "usable". The URL is free text an author types, so it can be
 * `hello`, and `getImagePath` passes anything that is not `ipfs://` straight through to the `<img>`.
 * `isRenderableImageSrc` is the check the codebase already keeps for exactly this — the comment on
 * it names the same hazard — so the chain reuses it rather than growing its own idea of a URL.
 * Anything it rejects falls through to the next candidate, which is the whole point of a chain.
 */
function usableImageUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return isRenderableImageSrc(trimmed) ? trimmed : null;
}

/**
 * The whole share-image chain in one call, so the routes that need it cannot disagree about the
 * order. Returns null when the entity offers nothing and the caller should fall back to the default
 * card.
 */
export function shareImage(relations?: Relation[]): string | null {
  return ogImage(relations) ?? usableImageUrl(cover(relations)) ?? usableImageUrl(avatar(relations));
}

export function spaces(values?: Value[], relations?: Relation[]): string[] {
  const realContent: string[] = [];
  const hiddenOnly: string[] = [];

  // Hidden-property values alone shouldn't make a space count as a "real"
  // home for this entity, so route around them when other content exists.
  for (const value of values ?? []) {
    if (HIDDEN_PROPERTIES.has(value.property.id)) {
      hiddenOnly.push(value.spaceId);
    } else {
      realContent.push(value.spaceId);
    }
  }

  for (const relation of relations ?? []) {
    realContent.push(relation.spaceId);
  }

  const realSet = new Set(realContent);
  if (realSet.size > 0) {
    return sortSpaceIdsByRank([...realSet]);
  }

  // Fallback: if there is no non-hidden content anywhere, keep the hidden-only
  // spaces so the entity is still navigable.
  return sortSpaceIdsByRank([...new Set(hiddenOnly)]);
}

export function spacesFromRoutingProjections({
  spaceIds,
  values,
  relations,
}: {
  spaceIds: readonly string[];
  values?: ReadonlyArray<{ spaceId: string; propertyId?: string | null; property?: { id?: string | null } | null }>;
  relations?: ReadonlyArray<{ spaceId: string }>;
}): string[] {
  const spacesWithRealContent = new Set<string>();

  for (const value of values ?? []) {
    const propertyId = value.propertyId ?? value.property?.id;
    if (!propertyId || !HIDDEN_PROPERTIES.has(propertyId)) {
      spacesWithRealContent.add(value.spaceId);
    }
  }

  for (const relation of relations ?? []) {
    spacesWithRealContent.add(relation.spaceId);
  }

  return sortSpaceIdsByRank(spaceIds.filter(id => spacesWithRealContent.has(id)));
}

export function entityHasOnlyPostType(entity: { types?: readonly { id: string }[] } | null | undefined): boolean {
  const types = entity?.types;
  if (!types?.length) return false;
  const typeIds = new Set(types.map(t => t.id));
  return typeIds.size === 1 && typeIds.has(SystemIds.POST_TYPE);
}
