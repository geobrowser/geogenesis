import { observable } from '@legendapp/state';
import { INetwork } from './network';

export class StubNetwork implements INetwork {
  pageNumber$ = observable(0);
  query$ = observable('');
  fetchTriples = async () => ({ triples: [], entityNames: {} });
  publish = async () => {};
}
