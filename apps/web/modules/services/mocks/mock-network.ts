import { BehaviorSubject } from 'rxjs';

export class MockNetwork {
  syncer$ = new BehaviorSubject([]);
  getRemoteFacts = async () => [];
}
