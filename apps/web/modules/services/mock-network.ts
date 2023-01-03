import { observable } from '@legendapp/state';
import { Triple } from '../types';
import { FetchTriplesOptions, INetwork } from './network';

export const makeStubTriple = (name: string): Triple => {
  return {
    id: name,
    entityId: name,
    entityName: name,
    attributeId: 'name',
    attributeName: 'Name',
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

  fetchTriples = async ({ skip, first }: FetchTriplesOptions) => {
    const triples = this.triples.slice(skip, skip + first);

    return {
      triples,
    };
  };

  fetchEntityTableData = async () => {
    return { rows: [], columns: [] };
  };

  fetchSpaces = async () => {
    return [];
  };

  fetchEntities = async () => {
    return [];
  };

  publish = async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    await new Promise(() => {});
  };
}
