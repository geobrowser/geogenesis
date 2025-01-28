import { INITIAL_RELATION_INDEX_VALUE } from '../../constants.js';
import { make as makeId } from '../id.js';
import { SYSTEM_IDS } from '../system-ids.js';
import type { CreateRelationOp, DeleteRelationOp } from '../types.js';
import { Position } from './position.js';

interface CreateRelationArgs {
  relationId?: string;
  fromId: string; // uuid
  toId: string; // uuid
  relationTypeId: string; // uuid
  position?: string; // fractional index
}

export function make(args: CreateRelationArgs): CreateRelationOp {
  const newEntityId = args.relationId ?? makeId();

  return {
    type: 'CREATE_RELATION',
    relation: {
      id: newEntityId,
      type: args.relationTypeId,
      fromEntity: args.fromId,
      toEntity: args.toId,
      index: args.position ?? INITIAL_RELATION_INDEX_VALUE,
    },
  };
}

export function remove(relationId: string): DeleteRelationOp {
  return {
    type: 'DELETE_RELATION',
    relation: {
      id: relationId,
    },
  };
}

interface ReorderRelationArgs {
  relationId: string;
  beforeIndex?: string;
  afterIndex?: string;
}

type ReorderRelationOp = {
  type: 'SET_TRIPLE';
  triple: {
    attribute: typeof SYSTEM_IDS.RELATION_INDEX;
    entity: string;
    value: {
      type: 'TEXT';
      value: string;
    };
  };
};

export function reorder(args: ReorderRelationArgs): ReorderRelationOp {
  const newIndex = Position.createBetween(args.beforeIndex, args.afterIndex);

  return {
    type: 'SET_TRIPLE',
    triple: {
      attribute: SYSTEM_IDS.RELATION_INDEX,
      entity: args.relationId,
      value: {
        type: 'TEXT',
        value: newIndex,
      },
    },
  };
}
