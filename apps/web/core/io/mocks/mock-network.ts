import { SYSTEM_IDS } from '@geogenesis/ids';
import { observable } from '@legendapp/state';

import { Space, Triple } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { FetchTriplesOptions, INetwork } from '../network';

export const makeStubTriple = (name: string, entityId?: string): Triple => {
  return {
    id: name,
    entityId: entityId ?? name,
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

export const makeStubSpace = (spaceId: string): Space => {
  return {
    id: spaceId,
    isRootSpace: false,
    editors: [],
    editorControllers: [],
    admins: [],
    attributes: {},
    entityId: spaceId,
    spaceConfigEntityId: null,
    createdAtBlock: '36472399',
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
    return Entity.entitiesFromTriples(this.triples);
  };

  fetchEntity = async (id: string) => {
    const entity = Entity.entitiesFromTriples(this.triples).find(e => e.id === id);
    if (!entity) return null;
    return entity;
  };

  columns = async () => {
    return { columns: [], columnsSchema: [] };
  };

  rows = async () => {
    return { rows: [], hasNextPage: false };
  };

  fetchProfile = async () => {
    return null;
  };

  fetchProposedVersion = async () => {
    return null;
  };

  fetchProposal = async () => {
    return null;
  };

  fetchProposedVersions = async () => {
    return [];
  };

  fetchProposals = async () => {
    return [];
  };
}
