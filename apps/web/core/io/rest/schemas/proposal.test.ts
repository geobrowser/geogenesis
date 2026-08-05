import { describe, expect, it } from 'vitest';

import {
  getSpaceTopicProposalDetails,
  getSubspaceProposalDetails,
  getVotingSettingsProposalDetails,
  mapApiActionsToProposalType,
} from './proposal';

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
    expect(getSubspaceProposalDetails([{ actionType: 'SUBSPACE_TOPIC_DECLARED', targetTopicId: 'topic-id' }])).toEqual({
      actionType: 'SUBSPACE_TOPIC_DECLARED',
      targetTopicId: 'topic-id',
    });
  });

  it('maps topic removal actions', () => {
    expect(getSubspaceProposalDetails([{ actionType: 'SUBSPACE_TOPIC_REMOVED', targetTopicId: 'topic-id' }])).toEqual({
      actionType: 'SUBSPACE_TOPIC_REMOVED',
      targetTopicId: 'topic-id',
    });
  });

  it('returns null when required identifiers are missing', () => {
    expect(getSubspaceProposalDetails([{ actionType: 'SUBSPACE_RELATED' }])).toBeNull();
    expect(getSubspaceProposalDetails([{ actionType: 'SUBSPACE_TOPIC_DECLARED', targetTopicId: 'topic-id' }])).toEqual({
      actionType: 'SUBSPACE_TOPIC_DECLARED',
      targetTopicId: 'topic-id',
    });
    expect(getSubspaceProposalDetails([{ actionType: 'SUBSPACE_TOPIC_DECLARED' }])).toBeNull();
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

describe('getSpaceTopicProposalDetails', () => {
  it('maps normalized set-topic actions', () => {
    expect(getSpaceTopicProposalDetails([{ actionType: 'SET_TOPIC', targetTopicId: 'topic-id' }])).toEqual({
      actionType: 'SET_TOPIC',
      targetTopicId: 'topic-id',
    });
  });

  it('maps normalized unset-topic actions', () => {
    expect(getSpaceTopicProposalDetails([{ actionType: 'UNSET_TOPIC', targetTopicId: 'topic-id' }])).toEqual({
      actionType: 'UNSET_TOPIC',
      targetTopicId: 'topic-id',
    });
  });

  it('maps topic declaration actions', () => {
    expect(getSpaceTopicProposalDetails([{ actionType: 'TOPIC_DECLARED', targetTopicId: 'topic-id' }])).toEqual({
      actionType: 'TOPIC_DECLARED',
      targetTopicId: 'topic-id',
    });
  });

  it('maps topic removal actions', () => {
    expect(getSpaceTopicProposalDetails([{ actionType: 'TOPIC_REMOVED', targetTopicId: 'topic-id' }])).toEqual({
      actionType: 'TOPIC_REMOVED',
      targetTopicId: 'topic-id',
    });
  });

  it('returns null for missing topic ids or ambiguous actions', () => {
    expect(getSpaceTopicProposalDetails([{ actionType: 'TOPIC_DECLARED' }])).toBeNull();
    expect(
      getSpaceTopicProposalDetails([
        { actionType: 'TOPIC_DECLARED', targetTopicId: 'topic-id' },
        { actionType: 'TOPIC_REMOVED', targetTopicId: 'topic-id' },
      ])
    ).toBeNull();
  });

  it('returns null for non-topic actions', () => {
    expect(
      getSpaceTopicProposalDetails([{ actionType: 'SUBSPACE_TOPIC_DECLARED', targetTopicId: 'topic-id' }])
    ).toBeNull();
  });
});

describe('getVotingSettingsProposalDetails', () => {
  it('extracts the proposed new values from an update-voting-settings action', () => {
    expect(
      getVotingSettingsProposalDetails([
        { actionType: 'UPDATE_VOTING_SETTINGS', slowThreshold: 5100000, fastThreshold: 2, quorum: 3, duration: 86400 },
      ])
    ).toEqual({ slowThreshold: 5100000, fastThreshold: 2, quorum: 3, durationSeconds: 86400 });
  });

  it('returns null when there is no update-voting-settings action', () => {
    expect(getVotingSettingsProposalDetails([{ actionType: 'PUBLISH', contentUri: 'ipfs://cid' }])).toBeNull();
  });

  it('returns null when the action carries none of the settings values', () => {
    expect(getVotingSettingsProposalDetails([{ actionType: 'UPDATE_VOTING_SETTINGS' }])).toBeNull();
  });
});

describe('mapApiActionsToProposalType — voting settings', () => {
  it('classifies a lone update-voting-settings action (not ADD_EDIT)', () => {
    expect(mapApiActionsToProposalType([{ actionType: 'UPDATE_VOTING_SETTINGS', quorum: 1 }])).toBe(
      'UPDATE_VOTING_SETTINGS'
    );
  });

  it('still prefers ADD_EDIT when a PUBLISH action is also present', () => {
    expect(
      mapApiActionsToProposalType([
        { actionType: 'UPDATE_VOTING_SETTINGS', quorum: 1 },
        { actionType: 'PUBLISH', contentUri: 'ipfs://cid' },
      ])
    ).toBe('ADD_EDIT');
  });
});
