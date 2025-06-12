import { ContentIds, SystemIds } from '@graphprotocol/grc-20';

import { EntityId } from '~/core/io/schema';
import { Triple as ITriple, RenderableProperty } from '~/core/types';
import { Relation, Value } from '~/core/v2.types';

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

export function nameFromRenderable(renderables: RenderableProperty[]): string | null {
  const value = renderables.find(r => r.attributeId === SystemIds.NAME_PROPERTY && r.type === 'TEXT')?.value as
    | string
    | undefined;
  return value ?? null;
}

export function nameValue(values: Value[]): Value | undefined {
  return values.find(value => value.property.id === SystemIds.NAME_PROPERTY);
}

export function nameTriples(triples: ITriple[]): ITriple[] {
  return triples.filter(triple => triple.attributeId === SystemIds.NAME_PROPERTY);
}

/**
 * This function traverses through all the relations associated with an entity and attempts to find the avatar URL of the entity.
 */
export function avatar(relations?: Relation[]): string | null {
  if (!relations) return null;
  return relations.find(r => r.type.id === EntityId(ContentIds.AVATAR_PROPERTY))?.toEntity.value ?? null;
}

/**
 * This function traverses through all the relations associated with an entity and attempts to find the cover URL of the entity.
 */
export function cover(relations?: Relation[]): string | null {
  if (!relations) return null;
  return relations.find(r => r.type.id === EntityId(SystemIds.COVER_PROPERTY))?.toEntity.value ?? null;
}

export function spaces(values?: Value[], relations?: Relation[]): string[] {
  const spaces: string[] = [];

  for (const value of values ?? []) {
    spaces.push(value.spaceId);
  }

  for (const relation of relations ?? []) {
    spaces.push(relation.spaceId);
  }

  return [...new Set(spaces)];
}
