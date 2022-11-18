import { observable } from '@legendapp/state';
import { EntityNames, Triple } from '../types';
import { FetchTriplesOptions, INetwork } from './network';

export const makeStubTriple = (name: string): Triple => {
  return {
    id: name,
    entityId: name,
    entityName: name,
    attributeId: 'name',
    value: {
      type: 'string',
      value: name,
      id: `s~${name}`,
    },
    space: 's',
  };
};

export class MockNetwork implements INetwork {
  pageNumber$ = observable(0);
  query$ = observable('');
  spaces$ = observable([]);
  triples: Triple[] = [];

  constructor({ triples = [] }: { triples: Triple[] } = { triples: [] }) {
    this.triples = triples;
  }

  fetchTriples = async ({ query, skip, first }: FetchTriplesOptions) => {
    const triples = this.triples.slice(skip, skip + first);

    return {
      triples,
      entityNames: triples.reduce((acc, triple) => {
        if (triple.value.type === 'string') {
          acc[triple.entityId] = triple.value.value;
        }
        return acc;
      }, {} as EntityNames),
    };
  };

  fetchSpaces = async () => {
    return [];
  };

  publish = async () => {};
}
