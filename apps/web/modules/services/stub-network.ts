import { BehaviorSubject } from 'rxjs';
import { INetwork } from './network';

export class StubNetwork implements INetwork {
  syncer$ = new BehaviorSubject([]);
  getNetworkTriples = async () => [];
  publish = async () => {};
}
