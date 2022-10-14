import { observable } from '@legendapp/state';
import { INetwork } from './network';

export class StubNetwork implements INetwork {
  query$ = observable('');
  fetchTriples = async () => ({ triples: [], entityNames: {} });
  publish = async () => {};
}
