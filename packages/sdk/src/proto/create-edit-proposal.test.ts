import { describe, expect, it } from 'vitest';

import { Relation } from '../relation.js';
import { createEditProposal } from './create-edit-proposal.js';
import { ActionType, Edit, OpType, ValueType } from './gen/src/proto/ipfs_pb.js';

describe('create-edit-proposal', () => {
  it('encodes and decodes Edit with SET_TRIPLE ops correctly', () => {
    const editBinary = createEditProposal({
      name: 'test',
      ops: [
        {
          type: 'SET_TRIPLE',
          triple: {
            attribute: 'test-attribute-id',
            entity: 'test-entity-id',
            value: {
              type: 'TEXT',
              value: 'test value',
            },
          },
        },
      ],
      author: '0x1234',
    });

    const result = Edit.fromBinary(editBinary);
    expect(result.name).toBe('test');
    expect(result.type).toBe(ActionType.ADD_EDIT);
    expect(result.version).toBe('1.0.0');
    expect(result.ops.length).toBe(1);
    expect(result.ops).toEqual([
      {
        type: OpType.SET_TRIPLE,
        triples: [],
        triple: {
          attribute: 'test-attribute-id',
          entity: 'test-entity-id',
          value: {
            type: ValueType.TEXT,
            value: 'test value',
          },
        },
      },
    ]);
  });

  it('encodes and decodes Edit with DELETE_TRIPLE ops correctly', () => {
    const editBinary = createEditProposal({
      name: 'test',
      ops: [
        {
          type: 'DELETE_TRIPLE',
          triple: {
            attribute: 'test-attribute-id',
            entity: 'test-entity-id',
          },
        },
      ],
      author: '0x1234',
    });

    const result = Edit.fromBinary(editBinary);
    expect(result.name).toBe('test');
    expect(result.type).toBe(ActionType.ADD_EDIT);
    expect(result.version).toBe('1.0.0');
    expect(result.ops.length).toBe(1);
    expect(result.ops).toEqual([
      {
        type: OpType.DELETE_TRIPLE,
        triples: [],
        triple: {
          attribute: 'test-attribute-id',
          entity: 'test-entity-id',
        },
      },
    ]);
  });

  it('encodes and decoded Edit with CREATE_RELATION ops correctly', () => {
    const editBinary = createEditProposal({
      name: 'test',
      ops: [
        Relation.make({
          relationId: 'test-relation-id',
          fromId: 'test-entity-id',
          relationTypeId: 'test-relation-type-id',
          toId: 'test-entity-id',
          position: 'test-position',
        }),
      ],
      author: '0x1234',
    });

    const result = Edit.fromBinary(editBinary);
    expect(result.name).toBe('test');
    expect(result.type).toBe(ActionType.ADD_EDIT);
    expect(result.version).toBe('1.0.0');
    expect(result.ops.length).toBe(1);
    expect(result.ops).toEqual([
      {
        type: OpType.CREATE_RELATION,
        triples: [],
        relation: {
          id: 'test-relation-id',
          type: 'test-relation-type-id',
          fromEntity: 'test-entity-id',
          toEntity: 'test-entity-id',
          index: 'test-position',
        },
      },
    ]);
  });

  it('encodes and decoded Edit with CREATE_RELATION ops correctly', () => {
    const editBinary = createEditProposal({
      name: 'test',
      ops: [
        {
          type: 'DELETE_RELATION',
          relation: {
            id: 'test-relation-id',
          },
        },
      ],
      author: '0x1234',
    });

    const result = Edit.fromBinary(editBinary);
    expect(result.name).toBe('test');
    expect(result.type).toBe(ActionType.ADD_EDIT);
    expect(result.version).toBe('1.0.0');
    expect(result.ops.length).toBe(1);
    expect(result.ops).toEqual([
      {
        type: OpType.DELETE_RELATION,
        triples: [],
        relation: {
          id: 'test-relation-id',
          fromEntity: '',
          toEntity: '',
          index: '',
          type: '',
        },
      },
    ]);
  });
});
