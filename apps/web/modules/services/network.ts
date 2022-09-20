import { Observable } from 'rxjs';
import { Signer } from 'ethers';
import { Log__factory } from '@geogenesis/contracts';
import { ITriple } from '../types';
import { createSyncService } from './sync';
import { Root } from '@geogenesis/action-schema';
import { IIpfs } from './ipfs';

type LogContract = typeof Log__factory;

export interface INetwork {
  syncer$: Observable<ITriple[]>;
  getRemoteFacts: () => Promise<ITriple[]>;
  createTriple: (triple: ITriple, signer: Signer) => Promise<ITriple>;
}

// This service mocks a remote database. In the real implementation this will be read
// from the subgraph
export class Network implements INetwork {
  private ipfs: IIpfs;
  private contract: LogContract;
  syncer$: Observable<ITriple[]>;

  constructor(contract: LogContract, ipfs: IIpfs, syncInterval = 5000) {
    // This could be composed in a functional way rather than initialized like this :thinking:
    this.syncer$ = createSyncService({ interval: syncInterval, callback: this.getRemoteFacts });
    this.contract = contract;
    this.ipfs = ipfs;
  }

  createTriple = async (triple: ITriple, signer: Signer) => {
    // TODO: Error handling
    const contract = this.contract.connect('0x5fbdb2315678afecb367f032d93f642f64180aa3', signer);

    // TODO: Some ipfs stuff probably
    // this.ipfs.???

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

    const tx = await contract.addEntry(
      `data:application/json;base64,${Buffer.from(JSON.stringify(root)).toString('base64')}`
    );

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
