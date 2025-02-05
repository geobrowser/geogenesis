import { GraphUrl, SYSTEM_IDS } from '@geogenesis/sdk';

import { mergeEntityAsync } from '~/core/database/entities';
import { Entity } from '~/core/io/dto/entities';
import { EntityId } from '~/core/io/schema';
import { RenderableProperty } from '~/core/types';

export type TripleSegment = {
  type: 'TRIPLE';
  property: string;
};

export type RelationSegment = {
  type: 'RELATION';
  property: string;
};

export type PathSegment = TripleSegment | RelationSegment;

/**
 * Relations blocks support mapping data from any entity in the relation into
 * specific UI fields in the block layout. This requires us to define a DSL
 * to represent the mapping from the data to the layout.
 *
 * This DSL is stored as a `TEXT` triple and represents paths from the Relation
 * and entities pointing from it. The path can specify either a relation or a
 * triple as the source of data, using the -> or . notation respectively. The
 * property id for the source is denoted by the `[]` notation. Ids within the
 * [] brackets are the ids for the properties to traverse.
 *
 * e.g.,
 * `->[ToId].[NameId]` specifies a path to the To entity's Name property,
 * which is a triple.
 * `->[ToId]->[CoverId]` specifies a path to the To entity's Cover property,
 * which is a relation.
 * `->[RolesId].[NameId]` specifies a path to the Roles relation's Name property,
 * which is a triple
 * `->[Roles]->[ToId].[NameId]` specifies a path to the Roles relation's to entity's
 *  Name property, which is a triple.
 * `.[NameId]` specifies a path to the Relation's Name property, which is a
 * triple.
 *
 * Decoding this DSL happens in two steps:
 * 1. Parse the DSL into an application lexicon
 * 2. Map the application lexicon to be able to query for correct data
 */
export function parseSelectorIntoLexicon(selector: string | null): PathSegment[] {
  if (selector === null) {
    return [];
  }

  const segments: PathSegment[] = [];
  const parts = selector.split(/(?=->|\.\[)/);

  for (const part of parts) {
    if (part.startsWith('->')) {
      // Relation
      const match = part.match(/->(\[([^\]]+)\])/);
      if (match) {
        segments.push({ type: 'RELATION', property: match[2] });
      }
    } else if (part.startsWith('.')) {
      // Triple
      const match = part.match(/\.(\[([^\]]+)\])/);
      if (match) {
        segments.push({ type: 'TRIPLE', property: match[2] });
      }
    }
  }

  return segments;
}

export async function mapSelectorLexiconToSourceEntity(
  lexicon: PathSegment[],
  startEntityId: string
): Promise<Entity[]> {
  let input = await mergeEntityAsync(EntityId(startEntityId));

  for (const segment of lexicon) {
    if (segment.type === 'TRIPLE') {
      // skip
    }

    // @TODO: Need to handle if the entity is an image
    if (segment.type === 'RELATION') {
      if (segment.property === SYSTEM_IDS.RELATION_TO_ATTRIBUTE) {
        const newInputId = input.triples.find(t => t.attributeId === SYSTEM_IDS.RELATION_TO_ATTRIBUTE)?.value.value;

        if (!newInputId) {
          continue;
        }

        input = await mergeEntityAsync(EntityId(GraphUrl.toEntityId(newInputId as `graph://${string}`)));

        continue;
      }

      const relations = input.relationsOut.filter(r => r.typeOf.id === segment.property);

      if (relations.length === 0) {
        return [];
      }

      return await Promise.all(relations.map(r => mergeEntityAsync(EntityId(r.toEntity.id))));
    }
  }

  return [input];
}

export function generateSelector(
  property: {
    id: string;
    name: string | null;
    renderableType: RenderableProperty['type'];
  },
  where: 'TO' | 'FROM' | 'SOURCE'
) {
  let selector: string | null = null;

  // @TODO: Put this logic in `data-selectors` and write tests
  const tripleRenderableTypes: RenderableProperty['type'][] = ['TEXT', 'URL', 'NUMBER', 'TIME', 'CHECKBOX'];

  if (tripleRenderableTypes.includes(property.renderableType)) {
    if (where === 'SOURCE') {
      selector = `.[${property.id}]`;
    }

    if (where === 'TO') {
      selector = `->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}]->.[${property.id}]`;
    }

    if (where === 'FROM') {
      // @TODO
    }
  }

  if (property.renderableType === 'RELATION' || property.renderableType === 'IMAGE') {
    if (where === 'SOURCE') {
      selector = `->[${property.id}]->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}]`;
    }

    if (where === 'TO') {
      // ->[Qx8dASiTNsxxP3rJbd4Lzd]->[399xP4sGWSoepxeEnp3UdR]->[Qx8dASiTNsxxP3rJbd4Lzd]
      selector = `->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}]->[${property.id}]->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}]`;

      if (property.id === SYSTEM_IDS.NAME_ATTRIBUTE) {
        selector = `->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}]`;
      }
    }

    if (where === 'FROM') {
      // @TODO
    }
  }

  return selector;
}
