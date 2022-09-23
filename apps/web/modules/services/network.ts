import { Root } from '@geogenesis/action-schema';
import { Log__factory } from '@geogenesis/contracts';
import { Signer } from 'ethers';
import { Observable } from 'rxjs';
import { Triple, Value } from '../types';
import { IAddressLoader } from './address-loader';
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

export interface INetwork {
  syncer$: Observable<Triple[]>;
  getNetworkTriples: () => Promise<Triple[]>;
  createTriple: (triple: Triple, signer: Signer) => Promise<Triple>;
}

// This service mocks a remote database. In the real implementation this will be read
// from the subgraph
export class Network implements INetwork {
  syncer$: Observable<Triple[]>;

  constructor(
    public contract: LogContract,
    public addressLoader: IAddressLoader,
    public storageClient: IStorageClient,
    syncInterval = 5000
  ) {
    // This could be composed in a functional way rather than initialized like this :thinking:
    this.syncer$ = createSyncService({ interval: syncInterval, callback: this.getNetworkTriples });
  }

  createTriple = async (triple: Triple, signer: Signer) => {
    const chain = await signer.getChainId();
    const contractAddress = await this.addressLoader.getContractAddress(chain, 'Log');

    // TODO: Error handling
    const contract = this.contract.connect(contractAddress, signer);

    const root: Root = {
      type: 'root',
      version: '0.0.1',
      actions: [
        {
          type: 'createTriple',
          entityId: triple.entityId,
          attributeId: triple.attributeId,
          value: triple.value,
        },
      ],
    };

    const cidString = await this.storageClient.uploadObject(root);

    const tx = await contract.addEntry(`ipfs://${cidString}`);

    // TODO: What to do with receipt???
    const receipt = await tx.wait();

    return triple;
  };

  getNetworkTriples = async () => {
    const url = 'http://localhost:8000/subgraphs/name/example';
    const response = await fetch(url, {
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
