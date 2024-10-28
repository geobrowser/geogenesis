import { describe, expect, it } from 'vitest';
import { createEditProposal } from './create-edit-proposal';
import { ActionType, Edit, Op } from './gen/src/proto/ipfs_pb';

describe("create-edit-proposal", () => {
  it("encodes and decodes Edit with upsert ops correctly", () => {
    const editBinary = createEditProposal({name: "test", ops: [{
      type: 'SET_TRIPLE',
      triple: {
        attribute: btoa('test-attribute-id'),
        entity: btoa('test-entity-id'),
        value: {
          type: 'TEXT',
          value: btoa('test value')
        }
      }
    }], author: '0x1234'})

    const result = Edit.fromBinary(editBinary)
    expect(result.name).toBe('test')
    expect(result.type).toBe(ActionType.ADD_EDIT)
    expect(result.version).toBe("1.0.0")
    expect(result.ops).toMatchSnapshot()
  })

  it("encodes and decodes Edit with upsert ops correctly", () => {
    const editBinary = createEditProposal({name: "test", ops: [{
      type: 'DELETE_TRIPLE',
      triple: {
        attribute: btoa('test-attribute-id'),
        entity: btoa('test-entity-id'),
      }
    }], author: '0x1234'})

    const result = Edit.fromBinary(editBinary)

    expect(result.name).toBe('test')
    expect(result.type).toBe(ActionType.ADD_EDIT)
    expect(result.version).toBe("1.0.0")
    expect(result.ops.length).toBe(1)
  })
})
