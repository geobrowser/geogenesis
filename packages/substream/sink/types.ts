import type * as s from 'zapatos/schema';

export enum TripleAction {
  Create = 'createTriple',
  Delete = 'deleteTriple',
}

export type TripleWithActionTuple = [TripleAction, s.triples.Insertable];
