import { SYSTEM_IDS } from '@geogenesis/ids';
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

export const makeStubTripleWithType = (typeId: string): Triple => {
  return {
    id: `id~${typeId}`,
    entityId: `entityId~${typeId}`,
    entityName: `entityName~${typeId}`,
    attributeId: SYSTEM_IDS.TYPES,
    attributeName: 'Types',
    value: {
      type: 'entity',
      name: `valueName~${typeId}`,
      id: typeId,
    },
    space: 's',
  };
};

export const makeStubTextAttribute = (name: string): Triple => {
  return {
    id: name,
    entityId: name,
    entityName: name,
    attributeId: SYSTEM_IDS.ATTRIBUTE,
    attributeName: 'Types',
    value: {
      type: 'entity',
      name: 'Text',
      id: SYSTEM_IDS.TEXT,
    },
    space: 's',
  };
};

export const makeStubRelationAttribute = (name: string): Triple => {
  return {
    id: name,
    entityId: name,
    entityName: name,
    attributeId: SYSTEM_IDS.ATTRIBUTE,
    attributeName: 'Types',
    value: {
      type: 'entity',
      name: 'Text',
      id: SYSTEM_IDS.RELATION,
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
    return { rows: [], columns: [], hasNextPage: false };
  };

  fetchSpaces = async () => {
    return [];
  };

  fetchEntities = async () => {
    return [];
  };

  fetchEntity = async () => {
    return { id: '', triples: [], name: null, description: null, types: [] };
  };

  columns = async () => {
    return { columns: [], columnsSchema: [] };
  };

  rows = async () => {
    return { rows: [], hasNextPage: false };
  };

  publish = async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    await new Promise(() => {});
  };

  fetchProfile = async () => {
    return null;
  };

  uploadFile = async () => {
    return '';
  };
}
