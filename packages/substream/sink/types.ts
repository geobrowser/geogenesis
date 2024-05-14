import type * as s from 'zapatos/schema';

export enum TripleAction {
  // @deprecated
  Create = 'createTriple',
  Delete = 'deleteTriple',
  Upsert = 'upsertTriple',
}

export type TripleOp = 'SET_TRIPLE' | 'DELETE_TRIPLE';

export type TripleWithActionTuple = [TripleAction, s.triples.Insertable];

export interface BlockEvent {
  cursor: string;
  blockNumber: number;
  timestamp: number;
  requestId: string; // uuid
}
