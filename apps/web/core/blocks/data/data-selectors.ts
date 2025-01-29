import { SYSTEM_IDS } from '@geogenesis/sdk';

import { RelationRow } from './queries';

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
export function parseSelectorIntoLexicon(selector: string): PathSegment[] {
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

type Renderable = {
  entityId: string;
  propertyId: string;
  value: string | null;
};

export function mapDataSelectorLexiconToData(lexicon: PathSegment[], input: RelationRow): Renderable | null {
  let target = input.this;
  let output: Renderable | null = null;

  for (const segment of lexicon) {
    if (segment.type === 'TRIPLE') {
      output = {
        entityId: target.id,
        propertyId: segment.property,
        value: target.triples.find(t => t.attributeId === segment.property)?.value.value ?? null,
      };
    }

    if (segment.type === 'RELATION') {
      if (segment.property === SYSTEM_IDS.RELATION_TO_ATTRIBUTE) {
        target = input.to;
      }

      const relation = target.relationsOut.find(r => r.typeOf.id === segment.property);

      if (relation) {
        output = {
          entityId: target.id,
          propertyId: segment.property,
          value: relation.toEntity.name ?? null,
        };
      }
    }
  }

  return output;
}
