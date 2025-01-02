import { Relation } from '@geogenesis/sdk';
import { ActionType, Import, ImportEdit, OpType, ValueType, createEditProposal } from '@geogenesis/sdk/proto';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { Decoder } from './decoder';

describe('decoder', () => {
  describe('decodeIpfsMetadata', () => {
    it('decodes an IPFS metadata for an EDIT', () => {
      const edit = createEditProposal({
        name: 'Test edit',
        author: '0x1234',
        ops: [],
      });

      const decoded = Effect.runSync(Decoder.decodeIpfsMetadata(edit as Buffer));

      expect(decoded).not.toBeNull();

      if (decoded === null) {
        return;
      }

      expect(decoded.type).toEqual('ADD_EDIT');
      expect(decoded.version).toEqual('1.0.0');
    });

    it('decodes an IPFS metadata for an IMPORT', () => {
      const testImport = new Import({
        type: ActionType.IMPORT_SPACE,
        version: '1.0.0',
        previousNetwork: 'test',
        previousContractAddress: '0x1234',
        edits: [],
      }).toBinary();

      const decoded = Effect.runSync(Decoder.decodeIpfsMetadata(testImport as Buffer));

      expect(decoded).not.toBeNull();

      if (decoded === null) {
        return;
      }

      expect(decoded.type).toEqual('IMPORT_SPACE');
      expect(decoded.version).toEqual('1.0.0');
    });
  });

  describe('decodeEdit', () => {
    it('decodes an IPFS metadata for an EDIT', () => {
      const edit = createEditProposal({
        name: 'Test edit',
        author: '0x1234',
        ops: [],
      });

      const decoded = Effect.runSync(Decoder.decodeEdit(edit as Buffer));

      expect(decoded).not.toBeNull();

      if (decoded === null) {
        return;
      }

      expect(decoded.type).toEqual('ADD_EDIT');
      expect(decoded.version).toEqual('1.0.0');
      expect(decoded.name).toEqual('Test edit');
      expect(decoded.authors).toEqual(['0x1234']);
    });

    it('decodes an EDIT with SET_TRIPLE ops', () => {
      const edit = createEditProposal({
        name: 'Test edit',
        author: '0x1234',
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
      });

      const decoded = Effect.runSync(Decoder.decodeEdit(edit as Buffer));

      expect(decoded).not.toBeNull();

      if (decoded === null) {
        return;
      }

      expect(decoded.ops).toEqual([
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
      ]);
    });

    it('decodes an EDIT with DELETE_TRIPLE ops', () => {
      const edit = createEditProposal({
        name: 'Test edit',
        author: '0x1234',
        ops: [
          {
            type: 'DELETE_TRIPLE',
            triple: {
              attribute: 'test-attribute-id',
              entity: 'test-entity-id',
            },
          },
        ],
      });

      const decoded = Effect.runSync(Decoder.decodeEdit(edit as Buffer));

      expect(decoded).not.toBeNull();

      if (decoded === null) {
        return;
      }

      expect(decoded.ops).toEqual([
        {
          type: 'DELETE_TRIPLE',
          triple: {
            attribute: 'test-attribute-id',
            entity: 'test-entity-id',
          },
        },
      ]);
    });

    it('decodes an EDIT with CREATE_RELATION ops', () => {
      const edit = createEditProposal({
        name: 'Test edit',
        author: '0x1234',
        ops: [
          Relation.make({
            relationId: 'test-relation-id',
            fromId: 'test-entity-id',
            relationTypeId: 'test-relation-type-id',
            toId: 'test-entity-id',
            position: 'test-index',
          }),
        ],
      });

      const decoded = Effect.runSync(Decoder.decodeEdit(edit as Buffer));

      expect(decoded).not.toBeNull();

      if (decoded === null) {
        return;
      }

      expect(decoded.ops).toEqual([
        {
          type: 'CREATE_RELATION',
          relation: {
            id: 'test-relation-id',
            index: 'test-index',
            fromEntity: 'test-entity-id',
            toEntity: 'test-entity-id',
            type: 'test-relation-type-id',
          },
        },
      ]);
    });

    it('decodes an EDIT with DELETE_RELATION ops', () => {
      const edit = createEditProposal({
        name: 'Test edit',
        author: '0x1234',
        ops: [
          {
            type: 'DELETE_RELATION',
            relation: {
              id: 'test-relation-id',
            },
          },
        ],
      });

      const decoded = Effect.runSync(Decoder.decodeEdit(edit as Buffer));

      expect(decoded).not.toBeNull();

      if (decoded === null) {
        return;
      }

      expect(decoded.ops).toEqual([
        {
          type: 'DELETE_RELATION',
          relation: {
            id: 'test-relation-id',
          },
        },
      ]);
    });
  });

  describe('decodeImportEdit', () => {
    it('decodes metadata for IMPORT_EDIT', () => {
      const testImport = new ImportEdit({
        type: ActionType.ADD_EDIT,
        version: '1.0.0',
        authors: ['0x1234'],
        name: 'Test edit',
        ops: [],
        blockHash: '0x1234',
        blockNumber: '1234',
        createdBy: '0x1234',
        createdAt: '1234',
        transactionHash: '0x1234',
        id: 'test-id',
      }).toBinary();

      const decoded = Effect.runSync(Decoder.decodeImportEdit(testImport as Buffer));

      expect(decoded).not.toBeNull();

      if (decoded === null) {
        return;
      }

      expect(decoded.type).toEqual('ADD_EDIT');
      expect(decoded.version).toEqual('1.0.0');
      expect(decoded.name).toEqual('Test edit');
      expect(decoded.authors).toEqual(['0x1234']);
      expect(decoded.createdBy).toEqual('0x1234');
      expect(decoded.createdAt).toEqual('1234');
      expect(decoded.id).toEqual('test-id');
    });

    it('decodes an IMPORT_EDIT with SET_TRIPLE ops', () => {
      const testImport = new ImportEdit({
        type: ActionType.ADD_EDIT,
        version: '1.0.0',
        authors: ['0x1234'],
        name: 'Test edit',
        ops: [
          {
            type: OpType.SET_TRIPLE,
            triple: {
              attribute: 'test-attribute-id',
              entity: 'test-entity-id',
              value: {
                type: ValueType.TEXT,
                value: 'test value',
              },
            },
          },
        ],
        blockHash: '0x1234',
        blockNumber: '1234',
        createdBy: '0x1234',
        createdAt: '1234',
        transactionHash: '0x1234',
        id: 'test-id',
      }).toBinary();

      const decoded = Effect.runSync(Decoder.decodeImportEdit(testImport as Buffer));

      expect(decoded).not.toBeNull();

      if (decoded === null) {
        return;
      }

      expect(decoded.ops).toEqual([
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
      ]);
    });

    it('decodes an IMPORT_EDIT with DELETE_TRIPLE ops', () => {
      const testImport = new ImportEdit({
        type: ActionType.ADD_EDIT,
        version: '1.0.0',
        authors: ['0x1234'],
        name: 'Test edit',
        ops: [
          {
            type: OpType.DELETE_TRIPLE,
            triple: {
              attribute: 'test-attribute-id',
              entity: 'test-entity-id',
            },
          },
        ],
        blockHash: '0x1234',
        blockNumber: '1234',
        createdBy: '0x1234',
        createdAt: '1234',
        transactionHash: '0x1234',
        id: 'test-id',
      }).toBinary();

      const decoded = Effect.runSync(Decoder.decodeImportEdit(testImport as Buffer));

      expect(decoded).not.toBeNull();

      if (decoded === null) {
        return;
      }

      expect(decoded.ops).toEqual([
        {
          type: 'DELETE_TRIPLE',
          triple: {
            attribute: 'test-attribute-id',
            entity: 'test-entity-id',
          },
        },
      ]);
    });

    it('decodes an IMPORT_EDIT with CREATE_RELATION ops', () => {
      const testImport = new ImportEdit({
        type: ActionType.ADD_EDIT,
        version: '1.0.0',
        authors: ['0x1234'],
        name: 'Test edit',
        ops: [
          {
            type: OpType.CREATE_RELATION,
            relation: {
              fromEntity: 'test-entity-id',
              id: 'test-relation-id',
              index: 'test-index',
              type: 'test-relation-type-id',
              toEntity: 'test-entity-id',
            },
          },
        ],
        blockHash: '0x1234',
        blockNumber: '1234',
        createdBy: '0x1234',
        createdAt: '1234',
        transactionHash: '0x1234',
        id: 'test-id',
      }).toBinary();

      const decoded = Effect.runSync(Decoder.decodeImportEdit(testImport as Buffer));

      expect(decoded).not.toBeNull();

      if (decoded === null) {
        return;
      }

      expect(decoded.ops).toEqual([
        {
          type: 'CREATE_RELATION',
          relation: {
            id: 'test-relation-id',
            index: 'test-index',
            fromEntity: 'test-entity-id',
            toEntity: 'test-entity-id',
            type: 'test-relation-type-id',
          },
        },
      ]);
    });

    it('decodes an IMPORT_EDIT with DELETE_RELATION ops', () => {
      const testImport = new ImportEdit({
        type: ActionType.ADD_EDIT,
        version: '1.0.0',
        authors: ['0x1234'],
        name: 'Test edit',
        ops: [
          {
            type: OpType.DELETE_RELATION,
            relation: {
              id: 'test-relation-id',
            },
          },
        ],
        blockHash: '0x1234',
        blockNumber: '1234',
        createdBy: '0x1234',
        createdAt: '1234',
        transactionHash: '0x1234',
        id: 'test-id',
      }).toBinary();

      const decoded = Effect.runSync(Decoder.decodeImportEdit(testImport as Buffer));

      expect(decoded).not.toBeNull();

      if (decoded === null) {
        return;
      }

      expect(decoded.ops).toEqual([
        {
          type: 'DELETE_RELATION',
          relation: {
            id: 'test-relation-id',
          },
        },
      ]);
    });
  });
});
