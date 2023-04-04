import { Root } from '@geogenesis/action-schema';
import { EntryAddedEventObject, Space as SpaceContract, Space__factory } from '@geogenesis/contracts';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { ContractTransaction, Event, Signer, utils } from 'ethers';

import { queries } from './io';
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
  Profile,
  Proposal,
  ReviewState,
  Space,
  Triple as TripleType,
  Version,
} from '../types';
import {
  fromNetworkActions,
  fromNetworkTriples,
  NetworkEntity,
  NetworkTriple,
  NetworkVersion,
} from './network-local-mapping';
import { IStorageClient } from './storage';
import { A } from '@mobily/ts-belt';

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
  query?: string;
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
  fetchProfile: (address: string, abortController?: AbortController) => Promise<[string, Profile] | null>;
  fetchEntity: (id: string, abortController?: AbortController) => Promise<EntityType | null>;
  fetchEntities: (options: FetchEntitiesOptions) => Promise<EntityType[]>;
  fetchProposedVersions: (entityId: string, spaceId: string, abortController?: AbortController) => Promise<Version[]>;
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

    if (!response.ok) {
      console.error(
        `Unable to fetch triples, space: ${space} query: ${query} skip: ${skip} first: ${first} filter: ${filter}`
      );
      console.error(`Failed fetch triples response text: ${await response.text()}`);
      return { triples: [] };
    }

    try {
      const json: {
        data: {
          triples: NetworkTriple[];
        };
      } = await response.json();

      const triples = fromNetworkTriples(json.data.triples.filter(triple => !triple.isProtected));
      return { triples };
    } catch (e) {
      console.error(
        `Unable to fetch triples, space: ${space} query: ${query} skip: ${skip} first: ${first} filter: ${filter}`
      );
      console.error(e);
      return { triples: [] };
    }
  };

  fetchEntity = async (id: string, abortController?: AbortController): Promise<EntityType | null> => {
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

    if (!response.ok) {
      console.error(`Unable to fetch entity, entityId: ${id}`);
      console.error(`Failed fetch entity response text: ${await response.text()}`);
      return null;
    }

    try {
      const json: {
        data: {
          geoEntity: NetworkEntity;
        };
      } = await response.json();

      const entity = json.data.geoEntity;

      if (!entity) {
        return null;
      }

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
    } catch (e) {
      console.error(`Unable to fetch entity, entityId: ${id}`);
      console.error(e);
      return null;
    }
  };

  fetchEntities = async ({ query, filter, abortController }: FetchEntitiesOptions) => {
    const fieldFilters = Object.fromEntries(filter.map(clause => [clause.field, clause.value])) as Record<
      FilterField,
      string
    >;

    const entityOfWhere = [
      fieldFilters['entity-id'] && `entity: ${JSON.stringify(fieldFilters['entity-id'])}`,
      fieldFilters['attribute-name'] &&
        `attribute_: {name_contains_nocase: ${JSON.stringify(fieldFilters['attribute-name'])}}`,
      fieldFilters['attribute-id'] && `attribute: ${JSON.stringify(fieldFilters['attribute-id'])}`,
      fieldFilters['not-space-id'] && `space_not: ${JSON.stringify(fieldFilters['not-space-id'])}`,

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
        query: queries.entitiesQuery(query, entityOfWhere),
      }),
    });

    if (!response.ok) {
      console.error(`Unable to fetch entities, query: ${query} filter: ${JSON.stringify(filter)}`);
      console.error(`Failed fetch entities response text: ${await response.text()}`);
      return [];
    }

    try {
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
          types: Entity.types(triples, nameTriple?.space),
          triples,
        };
      });

      // We filter block entities so we don't clutter entity search results with block entities.
      // Eventually we might want to let the caller handle the filtering instead of doing it
      // at the network level here.
      //
      // We could also do this filter at the top of the algorithm so we don't apply the extra
      // transformations onto entities that we are going to filter out.
      return sortedResultsWithTypesAndDescription.filter(result => {
        return !(
          result.types.some(t => t.id === SYSTEM_IDS.TEXT_BLOCK) ||
          result.types.some(t => t.id === SYSTEM_IDS.TABLE_BLOCK) ||
          result.types.some(t => t.id === SYSTEM_IDS.IMAGE_BLOCK)
        );
      });
    } catch (e) {
      console.error(`Unable to fetch entities, query: ${query} filter: ${JSON.stringify(filter)}`);
      console.error(e);
      return [];
    }
  };

  fetchSpaces = async () => {
    const { triples: spaceConfigTriples } = await this.fetchTriples({
      query: '',
      first: 1000,
      skip: 0,
      filter: [
        { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
        { field: 'linked-to', value: SYSTEM_IDS.SPACE_CONFIGURATION },
      ],
    });

    const spacesResponse = await fetch(this.subgraphUrl, {
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

    try {
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
      } = await spacesResponse.json();

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
          spaceConfigEntityId: spaceConfigTriples.find(triple => triple.space === space.id)?.entityId || null,
        };
      });

      return spaces;
    } catch (e) {
      console.error('Unable to fetch spaces');
      console.error(e);
      return [];
    }
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

    // This will return null if the entity we're fetching does not exist remotely
    const maybeEntities = await Promise.all(rowEntityIds.map(entityId => this.fetchEntity(entityId)));
    const entities = maybeEntities.flatMap(entity => (entity ? [entity] : []));

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

    // This will return null if the entity we're fetching does not exist remotely
    const maybeRelatedColumnTriples = await Promise.all(
      columnsTriples.triples.map(triple => this.fetchEntity(triple.value.id))
    );

    const relatedColumnTriples = maybeRelatedColumnTriples.flatMap(entity => (entity ? [entity] : []));

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

  fetchProposals = async (spaceId: string, abortController?: AbortController) => {
    const response = await fetch(this.subgraphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: abortController?.signal,
      body: JSON.stringify({
        query: queries.proposalsQuery(spaceId),
      }),
    });

    if (!response.ok) {
      console.error(`Unable to fetch proposals, spaceId: ${spaceId}`);
      console.error(`Failed proposed proposals fetch response text: ${await response.text()}`);
      return [];
    }

    const json: {
      data: {
        proposals: {
          id: string;
          createdBy: {
            id: string;
          };
          createdAt: number;
          name?: string;
          description?: string;
          space: string;
          status: 'APPROVED';
          proposedVersions: NetworkVersion[];
        }[];
      };
      errors: any[];
    } = await response.json();

    try {
      // We need to fetch the profiles of the users who created the ProposedVersions. We look up the Wallet entity
      // of the user and fetch the Profile for the user with the matching wallet address.
      const maybeProfiles = await Promise.all(json.data.proposals.map(v => this.fetchProfile(v.createdBy?.id)));

      // Create a map of wallet address -> profile so we can look it up when creating the application
      // ProposedVersions data structure. ProposedVersions have a `createdBy` field that should map to the Profile
      // of the user who created the ProposedVersion.
      const profiles = Object.fromEntries(maybeProfiles.flatMap(profile => (profile ? [profile] : [])));

      const result: Proposal[] = json.data.proposals.map(p => {
        return {
          ...p,

          // If the Wallet -> Profile doesn't mapping doesn't exist we use the Wallet address.
          createdBy: profiles[p.createdBy?.id] ?? { id: p.createdBy.id },
          proposedVersions: p.proposedVersions.map(v => {
            return {
              ...v,
              actions: fromNetworkActions(v.actions, spaceId),
            };
          }),
        };
      });

      return result;
    } catch (e) {
      console.error(`Unable to fetch proposals, spaceId: ${spaceId}`);
      console.error(e);
      console.error(json.errors);
      return [];
    }
  };

  fetchProposedVersions = async (entityId: string, spaceId: string, abortController?: AbortController) => {
    const response = await fetch(this.subgraphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: abortController?.signal,
      body: JSON.stringify({
        query: queries.proposedVersionsQuery(entityId),
      }),
    });

    if (!response.ok) {
      console.error(`Unable to fetch proposed versions, entityId: ${entityId} spaceId: ${spaceId}`);
      console.error(`Failed proposed versions fetch response text: ${await response.text()}`);
      return [];
    }

    const json: {
      data: {
        proposedVersions: NetworkVersion[];
      };
      errors: any[];
    } = await response.json();

    try {
      // We need to fetch the profiles of the users who created the ProposedVersions. We look up the Wallet entity
      // of the user and fetch the Profile for the user with the matching wallet address.
      const maybeProfiles = await Promise.all(json.data.proposedVersions.map(v => this.fetchProfile(v.createdBy.id)));

      // Create a map of wallet address -> profile so we can look it up when creating the application
      // ProposedVersions data structure. ProposedVersions have a `createdBy` field that should map to the Profile
      // of the user who created the ProposedVersion.
      const profiles = Object.fromEntries(maybeProfiles.flatMap(profile => (profile ? [profile] : [])));

      const result = json.data.proposedVersions.map((v, i) => {
        return {
          ...v,
          // If the Wallet -> Profile doesn't mapping doesn't exist we use the Wallet address.
          createdBy: profiles[v.createdBy.id] ?? v.createdBy,
          actions: fromNetworkActions(v.actions, spaceId),
        };
      });

      return result;
    } catch (e) {
      console.error(`Unable to fetch proposed versions, entityId: ${entityId} spaceId: ${spaceId}`);
      console.error(e);
      console.error(json.errors);
      return [];
    }
  };

  fetchProfile = async (address: string, abortController?: AbortController): Promise<[string, Profile] | null> => {
    const response = await fetch(this.subgraphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: abortController?.signal,
      // @TEMP: Right now we are fetching profiles based on the wallet address which is
      // the name of the entity. There _shouldn't_ be multiple wallets with the same name/address.
      body: JSON.stringify({
        query: queries.profileQuery(address),
      }),
    });

    if (!response.ok) {
      console.error(`Unable to fetch profile for address: ${address}`);
      console.error(`Failed fetch profile response text: ${await response.text()}`);
      return null;
    }

    const json: {
      data: {
        geoEntities: NetworkEntity[];
      };
      errors: any[];
    } = await response.json();

    try {
      // @TEMP: We need to fetch the actual Person entity related to Wallet to access the triple with
      // the avatar attribute. If we were indexing Profiles in the subgraph we wouldn't have to do this.
      const maybeWallets = await Promise.all(json.data.geoEntities.map(e => this.fetchEntity(e.id)));
      const wallets = maybeWallets.flatMap(entity => (entity ? [entity] : []));

      // We take the first wallet for a given address since there should only be one while in closed alpha.
      const wallet = A.head(wallets);

      if (!wallet) {
        return null;
      }

      // We have a backlink from a Wallet entity to a Person entity. We need to fetch the Person entity
      // to access profile attributes like the Avatar.
      const personTriple = wallet?.triples.find(t => t.attributeId === SYSTEM_IDS.PERSON_ATTRIBUTE);
      const personEntityId = personTriple?.value.id ?? null;

      if (!personEntityId) {
        return null;
      }

      const maybePerson = await this.fetchEntity(personEntityId);

      const avatarTriple = maybePerson?.triples.find(t => t.attributeId === SYSTEM_IDS.AVATAR_ATTRIBUTE);
      const avatarUrl = avatarTriple?.value.type === 'image' ? avatarTriple.value.value : null;

      return [
        address,
        {
          id: maybePerson?.id ?? '',
          name: maybePerson?.name ?? null,
          avatarUrl: avatarUrl,
        },
      ];
    } catch (e) {
      console.error(`Unable to fetch profile for address: ${address}`);
      console.error(e);
      console.error(json.errors);
      return null;
    }
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
