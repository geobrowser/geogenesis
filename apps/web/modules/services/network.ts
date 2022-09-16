import { Observable } from 'rxjs';
import { IFact } from '../types';
import { createSyncService } from './sync';

export interface IMockApi {
  syncer$: Observable<IFact[]>;
  insertFact: (fact: IFact) => IFact[];
}

// This service mocks a remote database. In the real implementation this will be read
// from the subgraph
export class MockApi {
  private REMOTE_FACTS: IFact[] = [
    {
      id: Math.random().toString(),
      entityId: Math.random().toString(),
      attribute: 'name',
      value: 'Van Horn',
    },
  ];

  syncer$: Observable<IFact[]>;

  contructor() {
    // This needs to be composed rather than initialized like this :thinking:
    this.syncer$ = createSyncService({ interval: 1000, callback: this.getRemoteFacts });
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
