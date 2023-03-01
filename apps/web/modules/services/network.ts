import { Root } from '@geogenesis/action-schema';
import { EntryAddedEventObject, Space as SpaceContract, Space__factory } from '@geogenesis/contracts';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { ContractTransaction, Event, Signer, utils } from 'ethers';

import { ROOT_SPACE_IMAGE } from '../constants';
import { Entity, InitialEntityTableStoreParams } from '../entity';
import { DEFAULT_PAGE_SIZE } from '../triple';
import {
  Account,
  Action,
  Column,
  Entity as EntityType,
  FilterField,
  FilterState,
  ReviewState,
  Space,
  Triple as TripleType,
} from '../types';
import { fromNetworkTriples, NetworkEntity, NetworkTriple } from './network-local-mapping';
import { IStorageClient } from './storage';

function getActionFromChangeStatus(action: Action) {
  switch (action.type) {
    case 'createTriple':
    case 'deleteTriple':
      return [action];

    case 'editTriple':
      return [action.before, action.after];
  }
}

export type FetchTriplesOptions = {
  query: string;
  space?: string;
  skip: number;
  first: number;
  filter: FilterState;
  abortController?: AbortController;
};

export type FetchEntitiesOptions = {
  query: string;
  space?: string;
  filter: FilterState;
  abortController?: AbortController;
};

export type PublishOptions = {
  signer: Signer;
  actions: Action[];
  space: string;
  onChangePublishState: (newState: ReviewState) => void;
};

type FetchTriplesResult = { triples: TripleType[] };

interface FetchColumnsOptions {
  spaceId: string;
  params: InitialEntityTableStoreParams & {
    skip: number;
    first: number;
  };
  abortController?: AbortController;
}

interface FetchColumnsResult {
  columns: Column[];
}

interface FetchRowsOptions {
  spaceId: string;
  params: InitialEntityTableStoreParams & {
    skip: number;
    first: number;
  };
  abortController?: AbortController;
}

interface FetchRowsResult {
  rows: EntityType[];
}

export interface INetwork {
  fetchTriples: (options: FetchTriplesOptions) => Promise<FetchTriplesResult>;
  fetchSpaces: () => Promise<Space[]>;
  fetchProfile: (address: string, abortController?: AbortController) => Promise<null>;
  fetchEntity: (id: string, abortController?: AbortController) => Promise<EntityType>;
  fetchEntities: (options: FetchEntitiesOptions) => Promise<EntityType[]>;
  columns: (options: FetchColumnsOptions) => Promise<FetchColumnsResult>;
  rows: (options: FetchRowsOptions) => Promise<FetchRowsResult>;
  publish: (options: PublishOptions) => Promise<void>;
  uploadFile: (file: File) => Promise<string>;
}

const UPLOAD_CHUNK_SIZE = 2000;

export class Network implements INetwork {
  constructor(public storageClient: IStorageClient, public subgraphUrl: string) {}

  publish = async ({ actions, signer, onChangePublishState, space }: PublishOptions): Promise<void> => {
    const contract = Space__factory.connect(space, signer);

    onChangePublishState('publishing-ipfs');
    const cids: string[] = [];

    for (let i = 0; i < actions.length; i += UPLOAD_CHUNK_SIZE) {
      console.log(`Publishing ${i / UPLOAD_CHUNK_SIZE}/${Math.ceil(actions.length / UPLOAD_CHUNK_SIZE)}`);

      const chunk = actions.slice(i, i + UPLOAD_CHUNK_SIZE);

      const root: Root = {
        type: 'root',
        version: '0.0.1',
        actions: chunk.flatMap(getActionFromChangeStatus),
      };

      const cidString = await this.storageClient.uploadObject(root);
      cids.push(`ipfs://${cidString}`);
    }

    onChangePublishState('signing-wallet');
    await addEntries(contract, cids, () => onChangePublishState('publishing-contract'));
  };

  uploadFile = async (file: File): Promise<string> => {
    const fileUri = await this.storageClient.uploadFile(file);
    return fileUri;
  };

  fetchProfile = async (address: string, abortController?: AbortController): Promise<null> => {
    /* Stub function */
    return null;
  };

  fetchTriples = async ({ space, query, skip, first, filter, abortController }: FetchTriplesOptions) => {
    const fieldFilters = Object.fromEntries(filter.map(clause => [clause.field, clause.value])) as Record<
      FilterField,
      string
    >;

    const where = [
      space && `space: ${JSON.stringify(space)}`,
      query && `entity_: {name_contains_nocase: ${JSON.stringify(query)}}`,
      fieldFilters['entity-id'] && `entity: ${JSON.stringify(fieldFilters['entity-id'])}`,
      fieldFilters['attribute-name'] &&
        `attribute_: {name_contains_nocase: ${JSON.stringify(fieldFilters['attribute-name'])}}`,
      fieldFilters['attribute-id'] && `attribute: ${JSON.stringify(fieldFilters['attribute-id'])}`,

      // Until we have OR we can't search for name_contains OR value string contains
      fieldFilters.value && `entityValue_: {name_contains_nocase: ${JSON.stringify(fieldFilters.value)}}`,
      fieldFilters['linked-to'] && `valueId: ${JSON.stringify(fieldFilters['linked-to'])}`,
    ]
      .filter(Boolean)
      .join(' ');

    const response = await fetch(this.subgraphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: abortController?.signal,
      body: JSON.stringify({
        query: `query {
          triples(where: {${where}}, skip: ${skip}, first: ${first}) {
            id
            attribute {
              id
              name
            }
            entity {
              id
              name
            }
            entityValue {
              id
              name
            }
            numberValue
            stringValue
            valueType
            valueId
            isProtected
            space {
              id
            }
          }
        }`,
      }),
    });

    const json: {
      data: {
        triples: NetworkTriple[];
      };
    } = await response.json();

    const triples = fromNetworkTriples(json.data.triples.filter(triple => !triple.isProtected));
    return { triples };
  };

  fetchEntity = async (id: string, abortController?: AbortController): Promise<EntityType> => {
    const response = await fetch(this.subgraphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: abortController?.signal,
      body: JSON.stringify({
        query: `query {
          geoEntity(id: ${JSON.stringify(id)}) {
            id,
            name
            entityOf {
              id
              stringValue
              valueId
              valueType
              numberValue
              space {
                id
              }
              entityValue {
                id
                name
              }
              attribute {
                id
                name
              }
              entity {
                id
                name
              }
            }
          }
        }`,
      }),
    });

    const json: {
      data: {
        geoEntity: NetworkEntity;
      };
    } = await response.json();

    const entity = json.data.geoEntity;

    const triples = fromNetworkTriples(entity.entityOf);
    const nameTriple = Entity.nameTriple(triples);

    return {
      id: entity.id,
      name: entity.name,
      description: Entity.description(triples),
      nameTripleSpace: nameTriple?.space,
      types: Entity.types(triples, entity?.nameTripleSpace ?? ''),
      triples,
    };
  };

  fetchEntities = async ({ space, query, filter, abortController }: FetchEntitiesOptions) => {
    const fieldFilters = Object.fromEntries(filter.map(clause => [clause.field, clause.value])) as Record<
      FilterField,
      string
    >;

    const entityOfWhere = [
      space && `space: ${JSON.stringify(space)}`,
      fieldFilters['entity-id'] && `entity: ${JSON.stringify(fieldFilters['entity-id'])}`,
      fieldFilters['attribute-name'] &&
        `attribute_: {name_contains_nocase: ${JSON.stringify(fieldFilters['attribute-name'])}}`,
      fieldFilters['attribute-id'] && `attribute: ${JSON.stringify(fieldFilters['attribute-id'])}`,

      // Until we have OR we can't search for name_contains OR value string contains
      fieldFilters.value && `entityValue_: {name_contains_nocase: ${JSON.stringify(fieldFilters.value)}}`,
      fieldFilters['linked-to'] && `valueId: ${JSON.stringify(fieldFilters['linked-to'])}`,
    ]
      .filter(Boolean)
      .join(' ');

    const response = await fetch(this.subgraphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: abortController?.signal,
      body: JSON.stringify({
        query: `query {
          startEntities: geoEntities(where: {name_starts_with_nocase: ${JSON.stringify(
            query
          )}, entityOf_: {${entityOfWhere}}}) {
            id,
            name
            entityOf {
              id
              stringValue
              valueId
              valueType
              numberValue
              space {
                id
              }
              entityValue {
                id
                name
              }
              attribute {
                id
                name
              }
              entity {
                id
                name
              }
            }
          }
          containEntities: geoEntities(where: {name_contains_nocase: ${JSON.stringify(
            query
          )}, entityOf_: {${entityOfWhere}}}) {
            id,
            name,
            entityOf {
              id
              stringValue
              valueId
              valueType
              numberValue
              space {
                id
              }
              entityValue {
                id
                name
              }
              attribute {
                id
                name
              }
              entity {
                id
                name
              }
            }
          }
        }`,
      }),
    });

    const json: {
      data: {
        startEntities: NetworkEntity[];
        containEntities: NetworkEntity[];
      };
    } = await response.json();

    const { startEntities, containEntities } = json.data;

    const sortedResults = sortSearchResultsByRelevance(startEntities, containEntities);

    const sortedResultsWithTypesAndDescription: EntityType[] = sortedResults.map(result => {
      const triples = fromNetworkTriples(result.entityOf);
      const nameTriple = Entity.nameTriple(triples);

      return {
        id: result.id,
        name: result.name,
        description: Entity.description(triples),
        nameTripleSpace: nameTriple?.space,
        types: Entity.types(triples, space),
        triples,
      };
    });

    return sortedResultsWithTypesAndDescription;
  };

  fetchSpaces = async () => {
    const response = await fetch(this.subgraphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `query {
          spaces {
            id
            isRootSpace
            admins {
              id
            }
            editors {
              id
            }
            editorControllers {
              id
            }
            entity {
              id
              entityOf {
                id
                stringValue
                attribute {
                  id
                }
              }
            }
          }
        }`,
      }),
    });

    const json: {
      data: {
        spaces: {
          id: string;
          isRootSpace: boolean;
          admins: Account[];
          editors: Account[];
          editorControllers: Account[];
          entity?: {
            id: string;
            entityOf: { id: string; stringValue: string; attribute: { id: string } }[];
          };
        }[];
      };
    } = await response.json();

    const spaces = json.data.spaces.map((space): Space => {
      const attributes = Object.fromEntries(
        space.entity?.entityOf.map(entityOf => [entityOf.attribute.id, entityOf.stringValue]) || []
      );

      if (space.isRootSpace) {
        attributes.name = 'Root';
        attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] = ROOT_SPACE_IMAGE;
      }

      return {
        id: space.id,
        isRootSpace: space.isRootSpace,
        admins: space.admins.map(account => account.id),
        editorControllers: space.editorControllers.map(account => account.id),
        editors: space.editors.map(account => account.id),
        entityId: space.entity?.id || '',
        attributes,
      };
    });

    return spaces;
  };

  rows = async ({ spaceId, params, abortController }: FetchRowsOptions) => {
    if (!params.typeId) {
      return { rows: [] };
    }

    /* To get our columns, fetch the all attributes from that type (e.g. Person -> Attributes -> Age) */
    /* To get our rows, first we get all of the entity IDs of the selected type */
    const rowEntities = await this.fetchTriples({
      query: params.query,
      space: spaceId,
      abortController,
      first: params.first,
      skip: params.skip,
      filter: [
        { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
        { field: 'linked-to', value: params.typeId },
      ],
    });

    /* Then we then fetch all triples associated with those row entity IDs */
    const rowEntityIds = rowEntities.triples.map(triple => triple.entityId);
    const entities = await Promise.all(rowEntityIds.map(entityId => this.fetchEntity(entityId)));

    return { rows: entities };
  };

  columns = async ({ spaceId, params, abortController }: FetchColumnsOptions) => {
    if (!params.typeId) {
      return { columns: [] };
    }

    const columnsTriples = await this.fetchTriples({
      query: '',
      space: spaceId,
      abortController,
      first: DEFAULT_PAGE_SIZE,
      skip: 0,
      filter: [
        { field: 'entity-id', value: params.typeId },
        { field: 'attribute-id', value: SYSTEM_IDS.ATTRIBUTES },
      ],
    });

    /* Then we fetch all of the associated triples for each column */

    // This will return empty triples if the related entity is not in the same space
    const relatedColumnTriples = await Promise.all(
      columnsTriples.triples.map(triple => this.fetchEntity(triple.value.id))
    );

    /* Name is the default column... */
    const defaultColumns: Column[] = [
      {
        id: SYSTEM_IDS.NAME,
        triples: [],
      },
    ];

    const schemaColumns: Column[] = columnsTriples.triples.map((triple, i) => ({
      id: triple.value.id,
      triples: relatedColumnTriples[i].triples,
    }));

    return { columns: [...defaultColumns, ...schemaColumns] };
  };
}

const sortLengthThenAlphabetically = (a: string | null, b: string | null) => {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  if (a.length === b.length) {
    return a.localeCompare(b);
  }
  return a.length - b.length;
};

function sortSearchResultsByRelevance(startEntities: NetworkEntity[], containEntities: NetworkEntity[]) {
  // TODO: This is where it's breaking
  const startEntityIds = startEntities.map(entity => entity.id);

  const primaryResults = startEntities.sort((a, b) => sortLengthThenAlphabetically(a.name, b.name));
  const secondaryResults = containEntities
    .filter(entity => !startEntityIds.includes(entity.id))
    .sort((a, b) => sortLengthThenAlphabetically(a.name, b.name));

  return [...primaryResults, ...secondaryResults];
}

async function findEvents(tx: ContractTransaction, name: string): Promise<Event[]> {
  const receipt = await tx.wait();
  return (receipt.events || []).filter(event => event.event === name);
}

async function addEntries(spaceContract: SpaceContract, uris: string[], onStartPublish: () => void) {
  const gasResponse = await fetch('https://gasstation-mainnet.matic.network/v2');
  const gasSuggestion: {
    safeLow: {
      maxPriorityFee: number;
      maxFee: number;
    };
    standard: {
      maxPriorityFee: number;
      maxFee: number;
    };
    fast: {
      maxPriorityFee: number;
      maxFee: number;
    };
    estimatedBaseFee: number;
  } = await gasResponse.json();

  const maxFeeAsGWei = utils.parseUnits(gasSuggestion.fast.maxFee.toFixed().toString(), 'gwei');
  const maxPriorityFeeAsGWei = utils.parseUnits(gasSuggestion.fast.maxPriorityFee.toFixed().toString(), 'gwei');

  const mintTx = await spaceContract.addEntries(uris, {
    maxFeePerGas: maxFeeAsGWei,
    maxPriorityFeePerGas: maxPriorityFeeAsGWei,
  });

  console.log(`Transaction receipt: ${JSON.stringify(mintTx)}`);

  onStartPublish();

  const transferEvent = await findEvents(mintTx, 'EntryAdded');
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const eventObject = transferEvent.pop()!.args as unknown as EntryAddedEventObject;
  return eventObject;
}
