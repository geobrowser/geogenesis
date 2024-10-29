import { SYSTEM_IDS } from '@geogenesis/sdk';

import { Entity } from '~/core/io/dto/entities';
import { EntityId } from '~/core/io/schema';
import { Triple as ITriple, Relation, RenderableProperty, ValueTypeId } from '~/core/types';

/**
 * This function traverses through all the triples of an Entity and attempts to find the
 * description of the entity.
 *
 * We assume that the Description triple's attribute for an Entity will match the expected
 * system Description attribute ID at SYSTEM_IDS.DESCRIPTION. However, anybody can
 * set up a triple that references _any_ attribute whose name is "Description."
 *
 * We currently handle this in the UI by checking the system ID for Description as well
 * as any attribute whose name is "Description."
 *
 * We currently only handle description triples whose value is a StringValue. If the value
 * is an EntityValue we assume it's not valid and don't attempt to parse it to render in the UI.
 */
export function description(triples: ITriple[]): string | null {
  const triple = descriptionTriple(triples);
  return triple?.value.type === 'TEXT' ? triple.value.value : null;
}

export function descriptionTriple(triples: ITriple[]): ITriple | undefined {
  return triples.find(triple => triple.attributeId === SYSTEM_IDS.DESCRIPTION);
}

/**
 * This function traverses through all the triples associated with an entity and attempts
 * to find the name of the entity.
 */
export function name(triples: ITriple[]): string | null {
  const triple = nameTriple(triples);
  return triple?.value.type === 'TEXT' ? triple?.value.value : null;
}

export function nameFromRenderable(renderables: RenderableProperty[]): string | null {
  const value = renderables.find(r => r.attributeId === SYSTEM_IDS.NAME && r.type === 'TEXT')?.value as
    | string
    | undefined;
  return value ?? null;
}

export function nameTriple(triples: ITriple[]): ITriple | undefined {
  return triples.find(triple => triple.attributeId === SYSTEM_IDS.NAME);
}

export function nameTriples(triples: ITriple[]): ITriple[] {
  return triples.filter(triple => triple.attributeId === SYSTEM_IDS.NAME);
}

export function valueTypeTriple(triples: ITriple[]): ITriple | undefined {
  return triples.find(triple => triple.attributeId === SYSTEM_IDS.VALUE_TYPE);
}

export function valueTypeId(triples: ITriple[]): ValueTypeId | null {
  // Returns SYSTEM_IDS.TEXT, SYSTEM_IDS.RELATION, etc... or null if not found
  const triple = valueTypeTriple(triples);
  return triple?.value.type === 'ENTITY' ? (triple?.value.value as ValueTypeId) : null;
}

/**
 * This function traverses through all the relations associated with an entity and attempts to find the avatar URL of the entity.
 */
export function avatar(relations?: Relation[]): string | null {
  if (!relations) return null;
  return relations.find(r => r.typeOf.id === EntityId(SYSTEM_IDS.AVATAR_ATTRIBUTE))?.toEntity.value ?? null;
}

/**
 * This function traverses through all the relations associated with an entity and attempts to find the cover URL of the entity.
 */
export function cover(relations?: Relation[]): string | null {
  if (!relations) return null;
  return relations.find(r => r.typeOf.id === EntityId(SYSTEM_IDS.COVER_ATTRIBUTE))?.toEntity.value ?? null;
}
