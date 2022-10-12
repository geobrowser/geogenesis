import { BehaviorSubject } from 'rxjs';
import { INetwork } from './network';

export class StubNetwork implements INetwork {
  syncer$ = new BehaviorSubject({ triples: [], entityNames: {} });
  getNetworkTriples = async () => ({ triples: [], entityNames: {} });
  publish = async () => {};
}
