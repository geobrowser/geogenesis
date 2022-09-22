import { Root } from '@geogenesis/action-schema';
import { Log__factory } from '@geogenesis/contracts';
import { Signer } from 'ethers';
import { Observable } from 'rxjs';
import { ITriple } from '../types';
import { IAddressLoader } from './address-loader';
import { IIpfs } from './ipfs';
import { IStorageClient } from './storage';
import { createSyncService } from './sync';

type LogContract = typeof Log__factory;

export interface INetwork {
  syncer$: Observable<ITriple[]>;
  getRemoteFacts: () => Promise<ITriple[]>;
  createTriple: (triple: ITriple, signer: Signer) => Promise<ITriple>;
}

// This service mocks a remote database. In the real implementation this will be read
// from the subgraph
export class Network implements INetwork {
  syncer$: Observable<ITriple[]>;

  constructor(
    public contract: LogContract,
    public ipfs: IIpfs,
    public addressLoader: IAddressLoader,
    public storageClient: IStorageClient,
    syncInterval = 5000
  ) {
    // This could be composed in a functional way rather than initialized like this :thinking:
    this.syncer$ = createSyncService({ interval: syncInterval, callback: this.getRemoteFacts });
  }

  createTriple = async (triple: ITriple, signer: Signer) => {
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
          entityId: triple.entity.id,
          attributeId: triple.attribute.id,
          // TODO: Pass value based on type
          value: {
            type: 'string',
            value: 'Byron',
          },
        },
      ],
    };

    const cidString = await this.storageClient.uploadObject(root);

    const tx = await contract.addEntry(`ipfs://${cidString}`);

    const receipt = await tx.wait();
    // TODO: What to do with receipt???

    return triple;
  };

  getRemoteFacts = async () => {
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
        triples: ITriple[];
      };
    } = await response.json();
    return json.data.triples;
  };
}
