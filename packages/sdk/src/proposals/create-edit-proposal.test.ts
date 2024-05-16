import { describe, expect, it } from 'vitest';
import { createEditProposal } from './create-edit-proposal';
import { Edit, IpfsContentType, Op } from '../proto/ipfs_pb';

describe("create-edit-proposal", () => {
  it("encodes and decodes Edit correctly", () => {
    const editBinary = createEditProposal({name: "test", ops: [{
      op: 'SET_TRIPLE',
      payload: {
        attributeId: btoa('test-attribute-id'),
        entityId: btoa('test-entity-id'),
        value: {
          type: 'TEXT',
          value: btoa('test value')
        }
      }
    }], author: '0x1234'})

    const result = Edit.fromBinary(editBinary)
    expect(result.name).toBe('test')
    expect(result.type).toBe(IpfsContentType.EDIT)
    expect(result.version).toBe("0.0.1")
    expect(result.ops).toMatchSnapshot()
  })
})