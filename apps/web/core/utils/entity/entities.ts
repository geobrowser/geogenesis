import { ContentIds, SystemIds } from '@graphprotocol/grc-20';

import { EntityId } from '~/core/io/schema';
import { Triple as ITriple, Relation, RenderableProperty } from '~/core/types';

/**
 * This function traverses through all the triples of an Entity and attempts to find the
 * description of the entity.
 *
 * We assume that the Description triple's attribute for an Entity will match the expected
 * system Description attribute ID at SystemIds.DESCRIPTION_ATTRIBUTE. However, anybody can
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
  return triples.find(triple => triple.attributeId === SystemIds.DESCRIPTION_ATTRIBUTE);
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
  const value = renderables.find(r => r.attributeId === SystemIds.NAME_ATTRIBUTE && r.type === 'TEXT')?.value as
    | string
    | undefined;
  return value ?? null;
}

export function nameTriple(triples: ITriple[]): ITriple | undefined {
  return triples.find(triple => triple.attributeId === SystemIds.NAME_ATTRIBUTE);
}

export function nameTriples(triples: ITriple[]): ITriple[] {
  return triples.filter(triple => triple.attributeId === SystemIds.NAME_ATTRIBUTE);
}

export function valueTypeTriple(triples: ITriple[]): ITriple | undefined {
  return triples.find(triple => triple.attributeId === SystemIds.VALUE_TYPE_ATTRIBUTE);
}

/**
 * This function traverses through all the relations associated with an entity and attempts to find the avatar URL of the entity.
 */
export function avatar(relations?: Relation[]): string | null {
  if (!relations) return null;
  return relations.find(r => r.typeOf.id === EntityId(ContentIds.AVATAR_ATTRIBUTE))?.toEntity.value ?? null;
}

/**
 * This function traverses through all the relations associated with an entity and attempts to find the cover URL of the entity.
 */
export function cover(relations?: Relation[]): string | null {
  if (!relations) return null;
  return relations.find(r => r.typeOf.id === EntityId(SystemIds.COVER_ATTRIBUTE))?.toEntity.value ?? null;
}

export function spaces(triples?: ITriple[], relations?: Relation[]): string[] {
  const spaces: string[] = [];

  for (const triple of triples ?? []) {
    spaces.push(triple.space);
  }

  for (const relation of relations ?? []) {
    spaces.push(relation.space);
  }

  return [...new Set(spaces)];
}
