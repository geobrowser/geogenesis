import { describe, expect, it } from 'vitest';

import { getSubspaceProposalDetails } from './proposal';

describe('getSubspaceProposalDetails', () => {
  it('maps verified add actions', () => {
    expect(getSubspaceProposalDetails([{ actionType: 'SUBSPACE_VERIFIED', targetSpaceId: 'child-space-id' }])).toEqual({
      actionType: 'SUBSPACE_VERIFIED',
      targetSpaceId: 'child-space-id',
    });
  });

  it('maps verified removal actions', () => {
    expect(
      getSubspaceProposalDetails([{ actionType: 'SUBSPACE_UNVERIFIED', targetSpaceId: 'child-space-id' }])
    ).toEqual({
      actionType: 'SUBSPACE_UNVERIFIED',
      targetSpaceId: 'child-space-id',
    });
  });

  it('maps related add actions', () => {
    expect(getSubspaceProposalDetails([{ actionType: 'SUBSPACE_RELATED', targetSpaceId: 'child-space-id' }])).toEqual({
      actionType: 'SUBSPACE_RELATED',
      targetSpaceId: 'child-space-id',
    });
  });

  it('maps related removal actions', () => {
    expect(getSubspaceProposalDetails([{ actionType: 'SUBSPACE_UNRELATED', targetSpaceId: 'child-space-id' }])).toEqual(
      {
        actionType: 'SUBSPACE_UNRELATED',
        targetSpaceId: 'child-space-id',
      }
    );
  });

  it('maps topic add actions', () => {
    expect(
      getSubspaceProposalDetails([
        { actionType: 'SUBSPACE_TOPIC_DECLARED', targetSpaceId: 'child-space-id', targetTopicId: 'topic-id' },
      ])
    ).toEqual({
      actionType: 'SUBSPACE_TOPIC_DECLARED',
      targetSpaceId: 'child-space-id',
      targetTopicId: 'topic-id',
    });
  });

  it('maps topic removal actions', () => {
    expect(
      getSubspaceProposalDetails([
        { actionType: 'SUBSPACE_TOPIC_REMOVED', targetSpaceId: 'child-space-id', targetTopicId: 'topic-id' },
      ])
    ).toEqual({
      actionType: 'SUBSPACE_TOPIC_REMOVED',
      targetSpaceId: 'child-space-id',
      targetTopicId: 'topic-id',
    });
  });

  it('returns null when required identifiers are missing', () => {
    expect(getSubspaceProposalDetails([{ actionType: 'SUBSPACE_RELATED' }])).toBeNull();
    expect(
      getSubspaceProposalDetails([{ actionType: 'SUBSPACE_TOPIC_DECLARED', targetSpaceId: 'child-space-id' }])
    ).toBeNull();
    expect(
      getSubspaceProposalDetails([{ actionType: 'SUBSPACE_TOPIC_DECLARED', targetTopicId: 'topic-id' }])
    ).toBeNull();
  });

  it('returns null for non-subspace actions', () => {
    expect(getSubspaceProposalDetails([{ actionType: 'PUBLISH', contentUri: 'ipfs://cid' }])).toBeNull();
  });

  it('returns null for ambiguous multiple subspace actions', () => {
    expect(
      getSubspaceProposalDetails([
        { actionType: 'SUBSPACE_VERIFIED', targetSpaceId: 'child-space-id' },
        { actionType: 'SUBSPACE_RELATED', targetSpaceId: 'other-space-id' },
      ])
    ).toBeNull();
  });
});
