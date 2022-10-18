import { computed, observable } from '@legendapp/state';
import { EntityNames, Triple } from '../types';
import { makeOptionalComputed } from '../utils';
import { FetchTriplesOptions, INetwork } from './network';

export const makeStubTriple = (name: string): Triple => {
  return {
    id: name,
    entityId: name,
    attributeId: 'name',
    value: {
      type: 'string',
      value: name,
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
        acc[triple.entityId] = triple.value.value;
        return acc;
      }, {} as EntityNames),
    };
  };

  fetchSpaces = async () => {
    return [];
  };

  publish = async () => {};
}
