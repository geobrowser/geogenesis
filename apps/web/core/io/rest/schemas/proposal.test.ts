import { describe, expect, it } from 'vitest';

import {
  getApiProposalCanExecute,
  getEffectiveApiProposalStatus,
  getSpaceTopicProposalDetails,
  getSubspaceProposalDetails,
  getVotingSettingsProposalDetails,
  isApiProposalExecutionWindowClosed,
  mapApiActionsToProposalType,
  proposalTypeFromActionTypes,
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

  // `false` is the meaningful half of this field — it is what grants new members the fast path —
  // and it is the value a truthiness check would drop on the floor. Both directions are asserted
  // so neither can be mistaken for "absent".
  it.each([
    ['granting new members the fast path', false],
    ['withholding it', true],
  ])('carries the new-member fast-path value through when it is %s', (_label, disabled) => {
    expect(
      getVotingSettingsProposalDetails([
        { actionType: 'UPDATE_VOTING_SETTINGS', quorum: 3, disableFastPathAccessForNewMembers: disabled },
      ])
    ).toEqual({ quorum: 3, disableFastPathForNewMembers: disabled });
  });

  // `hasAnyValue` tests `!== undefined` rather than truthiness. A proposal whose only reported
  // change is `false` still has something to say, and returning null here would hide it entirely
  // rather than merely leaving its row out.
  it('does not treat a lone false as an empty action', () => {
    expect(
      getVotingSettingsProposalDetails([
        { actionType: 'UPDATE_VOTING_SETTINGS', disableFastPathAccessForNewMembers: false },
      ])
    ).toEqual({ disableFastPathForNewMembers: false });
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

/**
 * The same precedence, reachable without a whole `ApiAction`.
 *
 * The profile's Proposals tab reads action types off the graph — two columns,
 * no schema — and had reimplemented this as "keep the first one back". No source
 * promises action order, which is what `findMembershipAction` has said all
 * along, so first-wins gives a multi-action proposal an arbitrary identity. For
 * an unnamed proposal that identity is its title.
 */
describe('proposalTypeFromActionTypes', () => {
  it('agrees with the ApiAction path it was split out of', () => {
    const actions = [{ actionType: 'ADD_MEMBER' as const, editor: '0x1' }];

    expect(proposalTypeFromActionTypes(actions.map(a => a.actionType))).toBe(mapApiActionsToProposalType(actions));
  });

  it('prefers PUBLISH wherever it sits in the list', () => {
    expect(proposalTypeFromActionTypes(['ADD_MEMBER', 'PUBLISH'])).toBe('ADD_EDIT');
    expect(proposalTypeFromActionTypes(['PUBLISH', 'ADD_MEMBER'])).toBe('ADD_EDIT');
  });

  // The case first-wins got wrong, and the reason this is not an index lookup.
  it('finds the membership action when it is not first', () => {
    expect(proposalTypeFromActionTypes(['UPDATE_VOTING_SETTINGS', 'REMOVE_EDITOR'])).toBe('REMOVE_EDITOR');
  });

  it('gives the same answer whichever order the actions arrive in', () => {
    const order = ['UPDATE_VOTING_SETTINGS', 'ADD_EDITOR', 'UNKNOWN'];

    expect(proposalTypeFromActionTypes(order)).toBe(proposalTypeFromActionTypes([...order].reverse()));
  });

  it('falls back to voting settings only when nothing outranks it', () => {
    expect(proposalTypeFromActionTypes(['UPDATE_VOTING_SETTINGS'])).toBe('UPDATE_VOTING_SETTINGS');
  });

  it('answers for a proposal with no actions at all', () => {
    expect(proposalTypeFromActionTypes([])).toBe('ADD_EDIT');
  });
});

// GEO-2609: proposal 995f… kept status EXECUTABLE and `canExecute: true` from the
// API for weeks after its `executeBy` (1787525526) passed, while the contract's
// `canExecuteProposal` had long returned false. These pin the deadline gate.
describe('execution deadline', () => {
  const EXECUTE_BY = 1_787_525_526;
  const passed = {
    canExecute: true,
    votingMode: 'SLOW' as const,
    quorum: { required: 1, current: 1, progress: 1, reached: true },
    threshold: { required: '5100000', current: 1, progress: 1, reached: true },
    status: 'EXECUTABLE' as const,
    executeBy: EXECUTE_BY,
  };

  it('offers execution up to and including executeBy, matching the contract', () => {
    // The contract refuses only when `block.timestamp > executeBy`.
    expect(getApiProposalCanExecute(passed, EXECUTE_BY - 1)).toBe(true);
    expect(getApiProposalCanExecute(passed, EXECUTE_BY)).toBe(true);
  });

  it('never offers execution once executeBy has passed, whatever the API says', () => {
    expect(getApiProposalCanExecute(passed, EXECUTE_BY + 1)).toBe(false);
    expect(getApiProposalCanExecute({ ...passed, votingMode: 'FAST' }, EXECUTE_BY + 1)).toBe(false);
  });

  it('never shows an expired EXECUTABLE proposal as executable', () => {
    expect(getEffectiveApiProposalStatus(passed, EXECUTE_BY + 1)).toBe('REJECTED');
    expect(getEffectiveApiProposalStatus(passed, EXECUTE_BY)).toBe('EXECUTABLE');
  });

  it('leaves settled outcomes alone after the deadline', () => {
    expect(getEffectiveApiProposalStatus({ status: 'ACCEPTED', executeBy: EXECUTE_BY }, EXECUTE_BY + 1)).toBe(
      'ACCEPTED'
    );
    expect(getEffectiveApiProposalStatus({ status: 'PROPOSED', executeBy: EXECUTE_BY }, EXECUTE_BY + 1)).toBe(
      'PROPOSED'
    );
  });

  it('treats a zero, null or missing executeBy as "no window yet", not as expired', () => {
    // v2 leaves executeBy at zero until the first vote; older API deployments omit it.
    for (const executeBy of [0, null, undefined]) {
      expect(isApiProposalExecutionWindowClosed({ executeBy }, EXECUTE_BY + 1)).toBe(false);
      expect(getApiProposalCanExecute({ ...passed, executeBy }, EXECUTE_BY + 1)).toBe(true);
    }
  });
});
