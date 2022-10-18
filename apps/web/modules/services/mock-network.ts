import { computed, observable } from '@legendapp/state';
import { EntityNames, Triple } from '../types';
import { makeOptionalComputed } from '../utils';
import { INetwork } from './network';

export const makeStubTriple = (name: string): Triple => {
  return {
    id: name,
    entityId: name,
    attributeId: 'name',
    value: {
      type: 'string',
      value: name,
    },
    space: '',
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

  fetchTriples = async (query: string, skip: number, first: number) => {
    const triples = this.triples.slice(skip, skip + first);

    return {
      triples,
      entityNames: triples.reduce((acc, triple) => {
        acc[triple.entityId] = triple.value.value;
        return acc;
      }, {} as EntityNames),
    };
  };

  publish = async () => {};
}
