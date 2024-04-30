import type * as s from 'zapatos/schema';

export enum TripleAction {
  Create = 'createTriple',
  Delete = 'deleteTriple',
}

export type TripleWithActionTuple = [TripleAction, s.triples.Insertable];

export interface BlockEvent {
  cursor: string;
  blockNumber: number;
  timestamp: number;
  requestId: string; // uuid
}
