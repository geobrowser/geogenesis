import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { HIDDEN_PROPERTIES } from '~/core/constants';
import { EntityId } from '~/core/io/substream-schema';
import { Relation, Value } from '~/core/types';
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

/**
 * Resolved the same way as `nameValue`, and for the same reason. Taking the first match meant array
 * order decided which space's description won, and `entity.values` is re-partitioned on every store
 * merge — so the winner could change between renders for no reason a reader could see. Name already
 * ranked; description silently did not, which also made the space fallback in `store.getEntity`
 * arbitrary rather than deliberate (GEO-2778).
 */
export function descriptionTriple(values: Value[]): Value | undefined {
  const descriptionValues = values.filter(value => value.property.id === SystemIds.DESCRIPTION_PROPERTY);
  if (descriptionValues.length <= 1) return descriptionValues[0];

  // Skip empty descriptions, then pick from the highest-ranked space.
  const nonEmpty = descriptionValues.filter(v => v.value);
  const candidates = nonEmpty.length > 0 ? nonEmpty : descriptionValues;
  return candidates.sort((a, b) => getSpaceRank(a.spaceId) - getSpaceRank(b.spaceId))[0];
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
 * Name and description as a reader inside `spaceId` should see them (GEO-2778).
 *
 * A space's version of an entity should read as that space wrote it — the words belong to the
 * people whose space it is. `name`/`description` above resolve across every space and pick the
 * highest-ranked, which is right when nobody named a space and wrong the moment somebody did.
 *
 * The cross-space fallback is deliberate: a space that never named the entity should read as the
 * graph does rather than render untitled. An empty string counts as absent, matching the judgement
 * `nameValue` already makes when choosing between spaces.
 *
 * Deliberately narrower than it looks: this is for *content*, which is space-specific. Aggregate
 * signals go the other way on purpose — GEO-2660 reads votes from the top-ranked space, because a
 * vote count re-counted per space would mean nothing.
 *
 * Takes the unscoped values and does its own filtering, so the fallback has something to fall back
 * to and both callers cannot disagree about what scoping means.
 */
export function nameInSpace(values: Value[], spaceId?: string): string | null {
  if (!spaceId) return name(values);
  return (name(values.filter(value => value.spaceId === spaceId)) || null) ?? name(values);
}

/** Companion to `nameInSpace`; see there for why the fallback exists. */
export function descriptionInSpace(values: Value[], spaceId?: string): string | null {
  if (!spaceId) return description(values);
  return (description(values.filter(value => value.spaceId === spaceId)) || null) ?? description(values);
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
