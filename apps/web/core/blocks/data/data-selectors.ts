import { GraphUrl, SYSTEM_IDS } from '@geogenesis/sdk';

import { mergeEntityAsync } from '~/core/database/entities';
import { Entity } from '~/core/io/dto/entities';
import { EntityId } from '~/core/io/schema';

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
  if (!selector) {
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
): Promise<Entity | null> {
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

      const relation = input.relationsOut.find(r => r.typeOf.id === segment.property);

      if (!relation) {
        return null;
      }

      input = await mergeEntityAsync(EntityId(relation.toEntity.id));
    }
  }

  return input;
}
