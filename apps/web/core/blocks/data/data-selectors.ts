import { GraphUrl, SystemIds } from '@graphprotocol/grc-20';

import { queryClient } from '~/core/query-client';
import { E } from '~/core/sync/orm';
import { store } from '~/core/sync/use-sync-engine';
import { Entity, RenderableProperty } from '~/core/v2.types';

type TripleSegment = {
  type: 'TRIPLE';
  property: string;
};

type RelationSegment = {
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

// @TODO(migration): Update to latest relations data model
export async function mapSelectorLexiconToSourceEntity(
  lexicon: PathSegment[],
  startEntityId: string
): Promise<Entity[]> {
  let input = await E.findOne({ id: startEntityId, cache: queryClient, store });

  for (const segment of lexicon) {
    if (segment.type === 'TRIPLE') {
      // skip
    }

    // @TODO: Need to handle if the entity is an image
    if (segment.type === 'RELATION') {
      if (segment.property === SystemIds.RELATION_TO_PROPERTY) {
        const newInputId = input?.values.find(t => t.property.id === SystemIds.RELATION_TO_PROPERTY)?.value;

        if (!newInputId) {
          continue;
        }

        input = await E.findOne({
          id: GraphUrl.toEntityId(newInputId as `graph://${string}`),
          cache: queryClient,
          store,
        });

        continue;
      }

      if (segment.property === SystemIds.RELATION_FROM_PROPERTY) {
        const newInputId = input?.values.find(t => t.property.id === SystemIds.RELATION_FROM_PROPERTY)?.value;

        if (!newInputId) {
          continue;
        }

        input = await E.findOne({
          id: GraphUrl.toEntityId(newInputId as `graph://${string}`),
          cache: queryClient,
          store,
        });

        continue;
      }

      const relations = input?.relations.filter(r => r.type.id === segment.property) ?? [];

      if (relations.length === 0) {
        return [];
      }

      return await E.findMany({
        store,
        cache: queryClient,
        where: { id: { in: relations.map(r => r.toEntity.id) } },
        first: 100,
        skip: 0,
      });
    }
  }

  if (input) {
    return [input];
  }

  return [];
}

export function generateSelector(
  property: {
    id: string;
    renderableType: RenderableProperty['type'];
  },
  where: 'TO' | 'FROM' | 'SOURCE'
) {
  let selector: string | null = null;
  const tripleRenderableTypes: RenderableProperty['type'][] = ['TEXT', 'NUMBER', 'TIME', 'CHECKBOX'];

  if (tripleRenderableTypes.includes(property.renderableType)) {
    if (where === 'SOURCE') {
      selector = `.[${property.id}]`;
    }

    if (where === 'TO') {
      selector = `->[${SystemIds.RELATION_TO_PROPERTY}]->.[${property.id}]`;

      if (property.id === SystemIds.NAME_PROPERTY) {
        selector = `->[${SystemIds.RELATION_TO_PROPERTY}]`;
      }
    }

    if (where === 'FROM') {
      selector = `->[${SystemIds.RELATION_FROM_PROPERTY}]->.[${property.id}]`;

      if (property.id === SystemIds.NAME_PROPERTY) {
        selector = `->[${SystemIds.RELATION_FROM_PROPERTY}]`;
      }
    }
  }

  if (property.renderableType === SystemIds.RELATION_TYPE || property.renderableType === SystemIds.IMAGE_TYPE) {
    if (where === 'SOURCE') {
      selector = `->[${property.id}]->[${SystemIds.RELATION_TO_PROPERTY}]`;
    }

    if (where === 'TO') {
      selector = `->[${SystemIds.RELATION_TO_PROPERTY}]->[${property.id}]->[${SystemIds.RELATION_TO_PROPERTY}]`;
    }

    if (where === 'FROM') {
      selector = `->[${SystemIds.RELATION_FROM_PROPERTY}]->[${property.id}]->[${SystemIds.RELATION_TO_PROPERTY}]`;
    }
  }

  return selector;
}

export function getIsSelected(
  selectors: string[],
  where: 'TO' | 'FROM' | 'SOURCE',
  property: {
    id: string;
    name: string | null;
    renderableType: RenderableProperty['type'];
  }
): boolean {
  return selectors.some(s => {
    const generatedSelector = generateSelector(property, where);

    // Render the name field of a TO selector to use the name
    if (where === 'TO' && property.id === SystemIds.NAME_PROPERTY) {
      return s === `->[${SystemIds.RELATION_TO_PROPERTY}]`;
    }

    if (where === 'FROM' && property.id === SystemIds.NAME_PROPERTY) {
      return s === `->[${SystemIds.RELATION_FROM_PROPERTY}]`;
    }

    return s === generatedSelector;
  });
}
