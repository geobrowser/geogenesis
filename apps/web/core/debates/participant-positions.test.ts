import { describe, expect, it, vi } from 'vitest';

import type { DebateRematchParticipant } from './api';
import {
  fetchParticipantPositions,
  groupParticipantPositions,
  isParticipantPositionsQueryKey,
  participantPositionsQueryKey,
  participantSidesOn,
} from './participant-positions';

const LOCAL: DebateRematchParticipant = {
  user_id: 'user-local',
  profile_space_id: '019fedae72b67ab2927adf044d57c566',
  display_name: 'You',
  avatar_cid: null,
  participant_slot: 1,
  consented_at: '2026-07-10T10:00:00.000Z',
};
const REMOTE: DebateRematchParticipant = {
  ...LOCAL,
  user_id: 'user-remote',
  profile_space_id: '019fedae72b67ab2927adf044d57c567',
  display_name: 'Salina',
  participant_slot: 2,
};

describe('fetchParticipantPositions', () => {
  // Positions are on-chain claim responses, which the graph indexes as `userVotes` keyed on the
  // responder's personal space. One filter for both people, active responses only, both kinds.
  it('asks for both participants’ active stance and veracity responses in one filter', async () => {
    const fetchPage = vi.fn().mockResolvedValue([]);

    await fetchParticipantPositions([LOCAL.profile_space_id, REMOTE.profile_space_id], undefined, fetchPage);

    expect(fetchPage).toHaveBeenCalledOnce();
    expect(fetchPage.mock.calls[0]![0]).toEqual({
      userId: { in: [LOCAL.profile_space_id, REMOTE.profile_space_id] },
      objectType: { is: 0 },
      voteType: { in: [0, 1] },
      voteKind: { in: [1, 2] },
    });
  });

  it('asks nothing for no participants', async () => {
    const fetchPage = vi.fn();
    await expect(fetchParticipantPositions([], undefined, fetchPage)).resolves.toEqual([]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('decodes rows into sides, dropping anything that is not an active stance or veracity response', async () => {
    const fetchPage = vi.fn().mockResolvedValue([
      { userId: LOCAL.profile_space_id, objectId: 'claim-1', spaceId: 'space-1', voteType: 0, voteKind: 1 },
      { userId: REMOTE.profile_space_id, objectId: 'claim-1', spaceId: 'space-1', voteType: 1, voteKind: 2 },
      // A curation vote is not a position.
      { userId: REMOTE.profile_space_id, objectId: 'claim-2', spaceId: 'space-1', voteType: 0, voteKind: 0 },
      // Nor is a withdrawn response.
      { userId: REMOTE.profile_space_id, objectId: 'claim-3', spaceId: 'space-1', voteType: 2, voteKind: 1 },
    ]);

    await expect(
      fetchParticipantPositions([LOCAL.profile_space_id, REMOTE.profile_space_id], undefined, fetchPage)
    ).resolves.toEqual([
      {
        profileSpaceId: LOCAL.profile_space_id,
        claimId: 'claim-1',
        spaceId: 'space-1',
        responseKind: 'stance',
        position: true,
      },
      {
        profileSpaceId: REMOTE.profile_space_id,
        claimId: 'claim-1',
        spaceId: 'space-1',
        responseKind: 'veracity',
        position: false,
      },
    ]);
  });

  it('pages until a short page comes back', async () => {
    const full = Array.from({ length: 500 }, (_, index) => ({
      userId: LOCAL.profile_space_id,
      objectId: `claim-${index}`,
      spaceId: 'space-1',
      voteType: 0,
      voteKind: 1,
    }));
    const fetchPage = vi.fn().mockResolvedValueOnce(full).mockResolvedValueOnce(full.slice(0, 3));

    const positions = await fetchParticipantPositions([LOCAL.profile_space_id], undefined, fetchPage);

    expect(positions).toHaveLength(503);
    expect(fetchPage.mock.calls.map(call => call[2])).toEqual([0, 500]);
  });
});

describe('participantSidesOn', () => {
  // geo-chat validates a request against the claim's home space, and the card publishes there; a
  // response in some other space that merely cites the claim is not a side on this claim.
  it('reads each participant’s side in the claim’s space only, matching ids in either form', () => {
    const byClaim = groupParticipantPositions([
      {
        profileSpaceId: LOCAL.profile_space_id,
        claimId: 'claim-1',
        spaceId: 'space-1',
        responseKind: 'stance',
        position: true,
      },
      {
        profileSpaceId: '019fedae-72b6-7ab2-927a-df044d57c567',
        claimId: 'claim-1',
        spaceId: 'SPACE-1',
        responseKind: 'stance',
        position: false,
      },
      {
        profileSpaceId: REMOTE.profile_space_id,
        claimId: 'claim-2',
        spaceId: 'space-9',
        responseKind: 'stance',
        position: true,
      },
    ]);

    expect(participantSidesOn(byClaim, 'claim-1', 'space-1', [LOCAL, REMOTE])).toEqual([
      { participant: LOCAL, position: true, responseKind: 'stance' },
      { participant: REMOTE, position: false, responseKind: 'stance' },
    ]);
    // Answered in a different space: no side here.
    expect(participantSidesOn(byClaim, 'claim-2', 'space-1', [LOCAL, REMOTE])).toEqual([
      { participant: LOCAL, position: null, responseKind: null },
      { participant: REMOTE, position: null, responseKind: null },
    ]);
  });
});

// Outside `'debates'`, so the mutations that invalidate that root leave it alone; the gateway
// reaches it by its own predicate.
it('keys the query outside the debates family, in participant order', () => {
  const key = participantPositionsQueryKey(['b', 'a']);
  expect(key[0]).not.toBe('debates');
  expect(key).toEqual(participantPositionsQueryKey(['a', 'b']));
  expect(isParticipantPositionsQueryKey(key)).toBe(true);
  expect(isParticipantPositionsQueryKey(['debates', 'claims'])).toBe(false);
});
