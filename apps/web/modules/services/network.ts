import { Observable } from 'rxjs';
import { IFact } from '../types';
import { createSyncService } from './sync';

export interface INetwork {
  syncer$: Observable<IFact[]>;
  insertFact: (fact: IFact) => IFact[];
}

// This service mocks a remote database. In the real implementation this will be read
// from the subgraph
export class MockNetwork implements INetwork {
  private REMOTE_FACTS: IFact[] = [
    {
      id: '293487',
      entityId: '234897',
      attribute: 'name',
      value: 'Van Horn',
    },
  ];

  syncer$: Observable<IFact[]>;

  constructor(syncInterval = 5000) {
    // This could be composed in a functional way rather than initialized like this :thinking:
    this.syncer$ = createSyncService({ interval: syncInterval, callback: this.getRemoteFacts });
  }

  insertFact = (fact: IFact) => {
    const ids = new Set(this.REMOTE_FACTS.map(fact => fact.id));
    if (ids.has(fact.id)) return this.REMOTE_FACTS;
    this.REMOTE_FACTS.push(fact);
    return this.REMOTE_FACTS.concat(fact);
  };

  private getRemoteFacts = async () => {
    return this.REMOTE_FACTS;
  };
}
