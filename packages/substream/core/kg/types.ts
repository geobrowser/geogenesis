import type { ChainEditProposal } from '../../sink/events/schema/proposal';
import type { ZodOp } from '../substream/parser';

export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type TripleOp = 'SET_TRIPLE' | 'DELETE_TRIPLE';

export interface BlockEvent {
  cursor: string;
  blockNumber: number;
  timestamp: number;
}

export interface GeoBlock extends BlockEvent {
  hash: string;
  network: string;
}

export type ValueType = 'TEXT' | 'NUMBER' | 'CHECKBOX' | 'URL' | 'TIME' | 'POINT';

export type ValueOptions = {
  language?: string;
  unit?: string;
  format?: string;
};

export type SetTripleOp = {
  type: 'SET_TRIPLE';
  space: string;
  triple: {
    entity: string;
    attribute: string;
    value: {
      type: ValueType;
      value: string;
      options?: ValueOptions;
    };
  };
};

export type DeleteTripleOp = {
  type: 'DELETE_TRIPLE';
  space: string;
  triple: {
    entity: string;
    attribute: string;
    value: Record<string, never>;
  };
};

export type CreateRelationOp = {
  type: 'CREATE_RELATION';
  space: string;
  relation: {
    id: string;
    index: string;
    fromEntity: string;
    toEntity: string;
    type: string;
  };
};

export type DeleteRelationOp = {
  type: 'DELETE_RELATION';
  space: string;
  relation: {
    id: string;
  };
};

// @TODO: Use type from grc-20 lib
type CsvMetadata = {
  type: 'CSV';
  columns: {
    id: string;
    type: ValueType | 'RELATION';
    relationType?: string;
    isId?: boolean;
    options?: ValueOptions;
  }[];
};

export type ImportFileOp = {
  type: 'IMPORT_FILE';
  space: string;
  url: string;
  metadata: CsvMetadata;
};

/**
 * We hardcode our Op type instead of deriving it from the Zod types. This is due to zod having
 * issues generating disciminate types from discriminate unions. See `ZodEditDeleteTriplePayload`
 * and `ZodEditDeleteTriplePayload` above.
 *
 * For now we cast the value depending on the op type during decoding and trust that it is
 * constructed into the correct ormat once it's decoded.
 *
 * @NOTE that we currently merge ops from previous versions of entities into new versions. If
 * an entity has triples from multiple spaces we need to keep the space_id of the original
 * triple instead of changing it to the space id of the edit being processed.
 */
export type Op = SetTripleOp | DeleteTripleOp | CreateRelationOp | DeleteRelationOp | ImportFileOp;

export type Edit = {
  name: string;
  version: string;
  ops: Op[];
  authors: string[];
  proposalId: string;
};

export type SinkProposal = { space: string; name: string; onchainProposalId: string };
export type SinkEditProposal = ChainEditProposal & { type: 'ADD_EDIT'; ops: Op[] } & SinkProposal;
// export type SinkAddMemberProposal = ChainAddMemberProposal & { type: 'ADD_MEMBER' } & SinkProposal;
// export type SinkRemoveMemberProposal = ChainRemoveMemberProposal & { type: 'REMOVE_MEMBER' } & SinkProposal;
// export type SinkAddEditorProposal = ChainAddEditorProposal & { type: 'ADD_EDITOR' } & SinkProposal;
// export type SinkRemoveEditorProposal = ChainRemoveEditorProposal & { type: 'REMOVE_EDITOR' } & SinkProposal;
// export type SinkAddSubspaceProposal = ChainAddSubspaceProposal & { type: 'ADD_SUBSPACE' } & SinkProposal;
// export type SinkRemoveSubspaceProposal = ChainRemoveSubspaceProposal & {
//   type: 'REMOVE_SUBSPACE';
// } & SinkProposal;

// export type SinkMembershipProposal = SinkAddMemberProposal | SinkRemoveMemberProposal;
// export type SinkEditorshipProposal = SinkAddEditorProposal | SinkRemoveEditorProposal;
// export type SinkSubspaceProposal = SinkAddSubspaceProposal | SinkRemoveSubspaceProposal;

export type IntermediateSinkEditProposal = OmitStrict<SinkEditProposal, 'ops'> & { ops: ZodOp[] };
