import { BehaviorSubject } from 'rxjs';
import { INetwork } from './network';

export class StubNetwork implements INetwork {
  query$ = new BehaviorSubject('');
  getNetworkTriples = async () => ({ triples: [], entityNames: {} });
  publish = async () => {};
}
