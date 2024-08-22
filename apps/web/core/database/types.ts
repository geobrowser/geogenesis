import { Triple } from '~/core/types';

import { Relation } from '../io/dto/entities';

export interface StoredTriple extends Triple {
  id: string;
}

export type StoredRelation = Relation & { isDeleted?: boolean };
