import { SYSTEM_IDS } from '@geogenesis/ids';
import { A, pipe } from '@mobily/ts-belt';

import { ID } from '~/core/id';
import {
  Action as ActionType,
  EntityValue,
  NumberValue,
  OmitStrict,
  StringValue,
  Triple,
  TripleValueType,
  Value,
} from '~/core/types';
import { valueTypes } from '~/core/value-types';

export function withId(triple: OmitStrict<Triple, 'id'>): Triple {
  return {
    ...triple,
    id: ID.createTripleId(triple),
  };
}

export function emptyPlaceholder(spaceId: string, entityId: string, valueTypeId = SYSTEM_IDS.TEXT): Triple {
  const type = (valueTypes[valueTypeId] || 'string') as TripleValueType;

  return {
    ...empty(spaceId, entityId, type),
    placeholder: true,
  };
}

export function emptyValue(type: TripleValueType): Value {
  const tripleValue: Record<TripleValueType, Value> = {
    string: {
      id: ID.createValueId(),
      type: 'string',
      value: '',
    } as StringValue,
    entity: {
      id: '',
      type: 'entity',
      name: '',
    } as EntityValue,
    number: {
      id: ID.createValueId(),
      type: 'number',
      value: '',
    } as NumberValue,
    image: {
      id: ID.createValueId(),
      type: 'image',
      value: '',
    },
    date: {
      id: ID.createValueId(),
      type: 'date',
      value: '',
    },
    url: {
      id: ID.createValueId(),
      type: 'url',
      value: '',
    },
  };

  return tripleValue[type];
}

// New, empty triples should generate unique triple IDs so they are distinguishable from
// other newly created triples locally.
export function empty(spaceId: string, entityId: string, type: TripleValueType = 'string'): Triple {
  const emptyTriple: OmitStrict<Triple, 'id'> = {
    entityId: entityId,
    attributeId: '',
    attributeName: '',
    value: emptyValue(type),
    space: spaceId,
    entityName: '',
  };

  return {
    ...emptyTriple,
    id: ID.createTripleId(emptyTriple),
  };
}

/**
 * This functions acts as documentation to denote why we don't change the id of a triple
 * locally when changes are made.
 *
 * Right now if you change the contents of a triple locally -- e.g., you change the Attribute
 * or the Value of a relation -- we don't update the Triple ID locally. This is to make it easy to
 * track how triples have changed locally over time for use in change counts, diffing, and
 * squashing local actions before publishing them.
 *
 * Whenever the triple gets published to the network, the subgraph will generate a new ID for the triple.
 */
export function ensureStableId(triple: Triple): Triple {
  return triple;
}

export function fromActions(actions: ActionType[] | undefined, triples: Triple[]) {
  if (!actions) return triples;

  const newTriples: Triple[] = [...triples].reverse();

  // If our actions have modified one of the network triples, we don't want to add that
  // network triple to the triples array
  actions.forEach(action => {
    switch (action.type) {
      case 'createTriple': {
        // We may add a triple that has the same attributeId as other triples. We want to insert
        // the new triple into the triples array in the same place as the other triples so the
        // list doesn't reorder.
        const indexOfSiblingTriples = newTriples.findIndex(t => t.attributeId === action.attributeId);
        if (indexOfSiblingTriples === -1) {
          newTriples.push(ensureStableId(action));
          break;
        }

        newTriples.splice(indexOfSiblingTriples, 0, action);
        break;
      }
      case 'deleteTriple': {
        const index = newTriples.findIndex(t => t.id === action.id);
        if (index === -1) {
          break;
        }

        newTriples.splice(index, 1);
        break;
      }
      case 'editTriple': {
        const index = newTriples.findIndex(t => t.id === action.before.id);
        if (index === -1) {
          newTriples.push(ensureStableId(action.after));
          break;
        }

        newTriples[index] = ensureStableId(action.after);
        break;
      }
    }
  });

  return newTriples.reverse();
}

/**
 * This function applies locally changed entity names to all triples being rendered.
 */
export function withLocalNames(actions: ActionType[], triples: Triple[]) {
  const newEntityNames = pipe(
    actions,
    A.map(a => {
      switch (a.type) {
        case 'editTriple':
          return a.after;
        default:
          return a;
      }
    }),
    A.reduce({} as Record<string, string>, (acc, entity) => {
      if (entity.entityName) acc[entity.entityId] = entity.entityName;
      return acc;
    })
  );

  return A.map(triples, triple => {
    const newTriple = { ...triple };

    // The triple is part of the entity whose name changed
    if (newEntityNames[triple.entityId]) {
      newTriple.entityName = newEntityNames[triple.entityId];
    }

    // The triple has an attribute whose name changed
    if (newEntityNames[triple.attributeId]) {
      newTriple.attributeName = newEntityNames[triple.attributeId];
    }

    // The triple has a an entity value whose name changed
    if (newEntityNames[triple.value.id]) {
      newTriple.value = {
        ...triple.value,
        name: newEntityNames[triple.value.id],
      } as EntityValue;
    }

    return newTriple;
  });
}

export const getValue = (triple: Triple): string | null => {
  switch (triple.value.type) {
    case 'number':
      return triple.value.value;
    case 'string':
      return triple.value.value;
    case 'entity':
      return triple.value.id;
    case 'image':
      return triple.value.value;
    case 'date':
      return triple.value.value;
    case 'url':
      return triple.value.value;
  }
};
