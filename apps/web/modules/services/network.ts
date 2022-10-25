import { Root } from '@geogenesis/action-schema';
import { Space__factory, EntryAddedEventObject, Space as SpaceContract } from '@geogenesis/contracts';
import { Signer, ContractTransaction, Event } from 'ethers';
import { Action } from '../state/triple-store';
import { Account, EntityNames, ReviewState, Space, Triple, Value } from '../types';
import { IStorageClient } from './storage';

type NetworkNumberValue = { valueType: 'NUMBER'; numberValue: string };

type NetworkStringValue = { valueType: 'STRING'; stringValue: string };

type NetworkEntityValue = { valueType: 'ENTITY'; entityValue: { id: string; name: string | null } };

type NetworkValue = NetworkNumberValue | NetworkStringValue | NetworkEntityValue;

/**
 * Triple type returned by GraphQL
 */
type NetworkTriple = NetworkValue & {
  id: string;
  entity: { id: string; name: string | null };
  attribute: { id: string; name: string | null };
  isProtected: boolean;
  space: string;
};

function extractValue(networkTriple: NetworkTriple): Value {
  switch (networkTriple.valueType) {
    case 'STRING':
      return { type: 'string', value: networkTriple.stringValue };
    case 'NUMBER':
      return { type: 'number', value: networkTriple.numberValue };
    case 'ENTITY':
      return { type: 'entity', value: networkTriple.entityValue.id };
  }
}

function getActionFromChangeStatus(action: Action) {
  switch (action.type) {
    case 'createTriple':
    case 'deleteTriple':
      return [action];

    case 'editTriple':
      return [action.before, action.after];
  }
}

let abortController = new AbortController();

export type FetchTriplesOptions = {
  query: string;
  space: string;
  skip: number;
  first: number;
};

export type PublishOptions = {
  signer: Signer;
  actions: Action[];
  space: string;
  onChangePublishState: (newState: ReviewState) => void;
};

export interface INetwork {
  fetchTriples: (options: FetchTriplesOptions) => Promise<{ triples: Triple[]; entityNames: EntityNames }>;
  fetchSpaces: () => Promise<Space[]>;
  publish: (options: PublishOptions) => Promise<void>;
}

// This service mocks a remote database. In the real implementation this will be read
// from the subgraph
export class Network implements INetwork {
  constructor(public storageClient: IStorageClient, public subgraphUrl: string) {}

  publish = async ({ actions, signer, onChangePublishState, space }: PublishOptions): Promise<void> => {
    const contract = Space__factory.connect(space, signer);

    onChangePublishState('publishing-ipfs');
    const cids: string[] = [];

    for (let i = 0; i < actions.length; i += 2000) {
      const chunk = actions.slice(i, i + 2000);

      const root: Root = {
        type: 'root',
        version: '0.0.1',
        actions: chunk.flatMap(getActionFromChangeStatus),
      };

      const cidString = await this.storageClient.uploadObject(root);
      cids.push(`ipfs://${cidString}`);
    }

    onChangePublishState('publishing-contract');
    const tx = await addEntries(contract, cids);

    await waitForLog(tx.index.toHexString(), this.subgraphUrl);
    console.log('Subgraph finished logging.', tx.index);
  };

  fetchTriples = async ({ space, query, skip, first }: FetchTriplesOptions) => {
    abortController.abort();
    abortController = new AbortController();

    const stringifyQuery = JSON.stringify(query);
    const stringifySpace = JSON.stringify(space);

    const nameQuery = query ? `entity_: {name_contains_nocase: ${stringifyQuery}}` : ``;

    const response = await fetch(this.subgraphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: abortController.signal,
      body: JSON.stringify({
        query: `query {
          triples(where: {space: ${stringifySpace} ${nameQuery}}, skip: ${skip}, first: ${first}) {
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
            isProtected
          }
        }`,
      }),
    });

    const json: {
      data: {
        triples: NetworkTriple[];
      };
    } = await response.json();

    const triples = json.data.triples
      // .filter(triple => !triple.isProtected)
      .map((networkTriple): Triple => {
        return {
          id: networkTriple.id,
          entityId: networkTriple.entity.id,
          attributeId: networkTriple.attribute.id,
          value: extractValue(networkTriple),
          space: networkTriple.space,
        };
      });

    const entityNames: EntityNames = json.data.triples.reduce((acc, triple) => {
      if (triple.entity.name !== null) {
        acc[triple.entity.id] = triple.entity.name;
      }

      if (triple.valueType === 'ENTITY') {
        acc[triple.entityValue.id] = triple.entityValue.name;
      }

      if (triple.attribute.name !== null) {
        acc[triple.attribute.id] = triple.attribute.name;
      }
      return acc;
    }, {} as EntityNames);

    return { triples, entityNames };
  };

  fetchSpaces = async () => {
    const response = await fetch(this.subgraphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: abortController.signal,
      body: JSON.stringify({
        query: `query {
          spaces {
            id
            admins {
              id
            }
            editors {
              id
            }
          }
        }`,
      }),
    });

    const json: {
      data: {
        spaces: { id: string; admins: Account[]; editors: Account[] }[];
      };
    } = await response.json();

    return json.data.spaces;
  };
}

async function findEvents(tx: ContractTransaction, name: string): Promise<Event[]> {
  const receipt = await tx.wait();
  return (receipt.events || []).filter(event => event.event === name);
}

async function addEntries(spaceContract: SpaceContract, uris: string[]) {
  const mintTx = await spaceContract.addEntries(uris);
  console.log(`Transaction receipt: ${JSON.stringify(mintTx)}`);
  const transferEvent = await findEvents(mintTx, 'EntryAdded');
  const eventObject = transferEvent.pop()!.args as unknown as EntryAddedEventObject;
  return eventObject;
}

function waitForLog(id: string, subgraphUrl: string) {
  const transformedId = id.replace('0x0', '0x');

  let retryCount = 0;
  let maxRetries = 30;

  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(async () => {
      retryCount++;

      if (retryCount > maxRetries) {
        reject();
        clearInterval(interval);
        return;
      }

      const response = await fetch(subgraphUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `query {
            logEntry(id: ${JSON.stringify(transformedId)}) {
              id
            }
          } `,
        }),
      });

      const json: {
        data: {
          logEntry: { id: string };
        };
      } = await response.json();

      if (json.data.logEntry) {
        clearInterval(interval);
        resolve();
      }
    }, 1000);
  });
}
