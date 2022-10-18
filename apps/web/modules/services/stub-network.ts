import { observable } from '@legendapp/state';
import { INetwork } from './network';

export class StubNetwork implements INetwork {
  pageNumber$ = observable(0);
  query$ = observable('');
  spaces$ = observable([]);
  fetchTriples = async () => ({ triples: [], entityNames: {} });
  fetchSpaces = async () => [];
  publish = async () => {};
}
