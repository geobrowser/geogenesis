import { Observable } from 'rxjs';
import { Log__factory } from '~/../../packages/contracts';
import { ITriple } from '../types';
import { createSyncService } from './sync';

type LogContract = typeof Log__factory;

export interface INetwork {
  syncer$: Observable<ITriple[]>;
  getRemoteFacts: () => Promise<ITriple[]>;
}

// This service mocks a remote database. In the real implementation this will be read
// from the subgraph
export class Network implements INetwork {
  private contract: LogContract;
  syncer$: Observable<ITriple[]>;

  constructor(contract: LogContract, syncInterval = 5000) {
    // This could be composed in a functional way rather than initialized like this :thinking:
    this.syncer$ = createSyncService({ interval: syncInterval, callback: this.getRemoteFacts });
    this.contract = contract;
  }

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
