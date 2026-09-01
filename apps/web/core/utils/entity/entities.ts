import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { HIDDEN_PROPERTIES } from '~/core/constants';
import { EntityId } from '~/core/io/substream-schema';
import { Relation, Value } from '~/core/types';
import { getTopRankedSpaceId, sortSpaceIdsByRank } from '~/core/utils/space/space-ranking';

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
 * The one value to show for a property an entity may carry in several spaces: skip the empty ones,
 * then take the highest-ranked space.
 *
 * Shared by name and description because they had drifted. Name ranked; description took the first
 * match, so array order decided the winner — and `entity.values` is re-partitioned on every store
 * merge, so an entity described by two spaces could swap descriptions between renders. That also
 * left the space fallback below arbitrary rather than deliberate (GEO-2778).
 */
function pickBySpaceRank(values: Value[], propertyId: string): Value | undefined {
  const candidates = values.filter(value => value.property.id === propertyId);
  if (candidates.length <= 1) return candidates[0];

  const nonEmpty = candidates.filter(v => v.value);
  const contenders = nonEmpty.length > 0 ? nonEmpty : candidates;

  // `getTopRankedSpaceId` rather than sorting on rank alone. Rank ties are the common case, not the
  // exotic one — only a handful of spaces are ranked and every other one, personal spaces included,
  // shares `UNRANKED`. A rank-only comparator leaves ties to sort stability, i.e. to array order,
  // which is the non-determinism this function exists to remove: `entity.values` is re-partitioned
  // on every store merge, so two unranked spaces could swap between renders. That helper already
  // tie-breaks on the id itself.
  const topSpaceId = getTopRankedSpaceId(contenders.map(value => value.spaceId));
  return contenders.find(value => value.spaceId === topSpaceId) ?? contenders[0];
}

export function descriptionTriple(values: Value[]): Value | undefined {
  return pickBySpaceRank(values, SystemIds.DESCRIPTION_PROPERTY);
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
  return pickBySpaceRank(values, SystemIds.NAME_PROPERTY);
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
 *
 * Deliberately not `scopeBySpacePrecedence`, which looks like the same shape and is not: its
 * fallback is Root *only*, because it scopes schema and Root holds the canonical version. Content
 * has no canonical space — an entity named in Crypto and nowhere else would render untitled to
 * every other space under that rule. This falls back to the ranked resolution across all spaces.
 */
function writtenIn(values: Value[], spaceId: string): Value[] {
  return values.filter(value => value.spaceId === spaceId);
}

export function nameInSpace(values: Value[], spaceId?: string): string | null {
  // `|| null` on every branch, including the cross-space one. An empty name is nothing written, and
  // a non-nullish `''` returned from here is worse than useless downstream: it satisfies the `??` in
  // `getEntity` and `E.merge`, blocking the synced/remote aggregate and rendering the entity
  // untitled — the exact opposite of the rule. `pickBySpaceRank` only skips empties when it has
  // more than one candidate, so a lone empty triple reaches here intact.
  if (!spaceId) return name(values) || null;
  return (name(writtenIn(values, spaceId)) || null) ?? (name(values) || null);
}

/**
 * Unlike `nameInSpace`, this does **not** fall back: a space that has not described the entity
 * shows no description.
 *
 * The asymmetry is the point. A name is an identifier — an entity rendered untitled is unusable,
 * and borrowing the graph's name costs a reader nothing because it names the same thing. A
 * description is editorial: borrowing another space's prose puts words in this space's mouth, and
 * silence is the honest answer. Empty and absent are the same answer here for that reason.
 */
export function descriptionInSpace(values: Value[], spaceId?: string): string | null {
  if (!spaceId) return description(values) || null;
  return description(writtenIn(values, spaceId)) || null;
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
