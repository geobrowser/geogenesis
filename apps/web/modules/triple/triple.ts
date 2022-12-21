import { ID } from '../id';
import { Action, OmitStrict, Triple } from '../types';

export function withId(triple: OmitStrict<Triple, 'id'>): Triple {
  return {
    ...triple,
    id: ID.createTripleId(triple),
  };
}

export function empty(spaceId: string, entityId: string): Triple {
  const emptyTriple: OmitStrict<Triple, 'id'> = {
    entityId: entityId,
    attributeId: '',
    attributeName: '',
    value: {
      id: '',
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
          newTriples.push(action);
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
        newTriples[index] = action.after;
        break;
      }
    }
  });

  return newTriples;
}
