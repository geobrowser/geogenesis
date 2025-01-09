import { DeleteTripleAppOp, OmitStrict, Relation, SetTripleAppOp, Triple } from '~/core/types';

import { EntityId } from '../io/schema';

export interface StoredTriple extends Triple {
  id: string;
}

export type StoredRelation = Relation & { isDeleted?: boolean };

type WriteStoreOp = OmitStrict<SetTripleAppOp, 'id'>;
type DeleteStoreOp = OmitStrict<DeleteTripleAppOp, 'id' | 'attributeName' | 'entityName' | 'value'> & {
  attributeName?: string | null;
  value?: DeleteTripleAppOp['value'];
};
export type UpsertOp = OmitStrict<WriteStoreOp, 'type'>;
export type RemoveOp = OmitStrict<DeleteStoreOp, 'type'>;

export type StoreRelation = OmitStrict<Relation, 'id'> & { id?: EntityId };
