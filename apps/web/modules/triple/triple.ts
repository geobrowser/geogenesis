import { ID } from '../id';
import { Action, OmitStrict, Triple } from '../types';

export function withId(triple: OmitStrict<Triple, 'id'>): Triple {
  return {
    ...triple,
    id: ID.createTripleId(triple),
  };
}

// New, empty triples should generate unique triple IDs so they are distinguishable from
// other newly created triples locally.
export function empty(spaceId: string, entityId: string): Triple {
  const emptyTriple: OmitStrict<Triple, 'id'> = {
    entityId: entityId,
    attributeId: '',
    attributeName: '',
    value: {
      id: ID.createValueId(),
      type: 'string',
      value: '',
    },
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

export function fromActions(spaceId: string, actions: Action[] | undefined, triples: Triple[]) {
  const newTriples: Triple[] = [...triples].reverse();
  const newActions = actions ?? [];

  // If our actions have modified one of the network triples, we don't want to add that
  // network triple to the triples array
  newActions.forEach(action => {
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
        newTriples.splice(index, 1);
        break;
      }
      case 'editTriple': {
        const index = newTriples.findIndex(t => t.id === action.before.id);
        newTriples[index] = ensureStableId(action.after);
        break;
      }
    }
  });

  return newTriples.reverse();
}
