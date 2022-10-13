import { BehaviorSubject } from 'rxjs';
import { INetwork } from './network';

export class StubNetwork implements INetwork {
  query$ = new BehaviorSubject('');
  fetchTriples = async () => ({ triples: [], entityNames: {} });
  publish = async () => {};
}
