import { Root } from '@geogenesis/action-schema';
import { Log__factory } from '@geogenesis/contracts';
import { Signer } from 'ethers';
import { Observable } from 'rxjs';
import { Triple, Value } from '../types';
import { IAddressLoader } from './address-loader';
import { createTripleId, createTripleWithId } from './create-id';
import { IStorageClient } from './storage';
import { createSyncService } from './sync';

type LogContract = typeof Log__factory;

type NetworkNumberValue = { valueType: 'NUMBER'; numberValue: string };

type NetworkStringValue = { valueType: 'STRING'; stringValue: string };

type NetworkEntityValue = { valueType: 'ENTITY'; entityValue: { id: string } };

type NetworkValue = NetworkNumberValue | NetworkStringValue | NetworkEntityValue;

/**
 * Triple type returned by GraphQL
 */
type NetworkTriple = NetworkValue & {
  id: string;
  entity: { id: string };
  attribute: { id: string };
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

function getActionFromChangeStatus(triple: Required<Triple>) {
  switch (triple.status) {
    case 'created':
      return {
        type: 'createTriple',
        entityId: triple.entityId,
        attributeId: triple.attributeId,
        value: triple.value,
      } as const;

    case 'edited':
      return {
        type: 'createTriple',
        entityId: triple.entityId,
        attributeId: triple.attributeId,
        value: triple.value,
      } as const;

    case 'deleted':
      return {
        type: 'deleteTriple',
        entityId: triple.entityId,
        attributeId: triple.attributeId,
        value: triple.value,
      } as const;
  }
}

export interface INetwork {
  syncer$: Observable<Triple[]>;
  getNetworkTriples: () => Promise<Triple[]>;
  publish: (triples: Triple[], signer: Signer) => Promise<void>;
}

// This service mocks a remote database. In the real implementation this will be read
// from the subgraph
export class Network implements INetwork {
  syncer$: Observable<Triple[]>;

  constructor(
    public contract: LogContract,
    public addressLoader: IAddressLoader,
    public storageClient: IStorageClient,
    public subgraphUrl: string,
    syncInterval = 5000
  ) {
    // This could be composed in a functional way rather than initialized like this :thinking:
    this.syncer$ = createSyncService({ interval: syncInterval, callback: this.getNetworkTriples });
  }

  publish = async (triples: Triple[], signer: Signer): Promise<void> => {
    const chain = await signer.getChainId();
    const contractAddress = await this.addressLoader.getContractAddress(chain, 'Log');
    const contract = this.contract.connect(contractAddress, signer);

    const root: Root = {
      type: 'root',
      version: '0.0.1',
      // @ts-expect-error TODO(byron): Fix these types
      actions: triples.map(getActionFromChangeStatus),
    };

    const cidString = await this.storageClient.uploadObject(root);
    const tx = await contract.addEntry(`ipfs://${cidString}`);

    // TODO: What to do with receipt???
    const receipt = await tx.wait();
    console.log(`Transaction receipt: ${JSON.stringify(receipt)}`);
  };

  getNetworkTriples = async () => {
    const response = await fetch(this.subgraphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `query { 
          triples {
            id
            attribute {
              id
            }
            entity {
              id
            }
            entityValue {
              id
            }
            numberValue
            stringValue
            valueType
          } 
        }`,
      }),
    });

    const json: {
      data: {
        triples: NetworkTriple[];
      };
    } = await response.json();

    const triples = json.data.triples.map((networkTriple): Triple => {
      return {
        id: networkTriple.id,
        entityId: networkTriple.entity.id,
        attributeId: networkTriple.attribute.id,
        value: extractValue(networkTriple),
      };
    });

    return triples;
  };
}
