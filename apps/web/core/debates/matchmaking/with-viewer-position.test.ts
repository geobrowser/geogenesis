import { describe, expect, it } from 'vitest';

import type { DebateClaimPositionSummary, DebateParticipantSummary } from '~/core/debates/api';

import { presentCount, withViewerPosition } from './matchmaking-claim-card';

const VIEWER_SPACE = '019fedb10c417f3e9a112c7d5e8b4419';
const OTHER_SPACE = '019fedb21d527a4f8b223d8e6f9c5520';

function participant(profileSpaceId: string): DebateParticipantSummary {
  return {
    user_id: `user:${profileSpaceId}`,
    profile_space_id: profileSpaceId,
    display_name: 'Someone',
    avatar_cid: null,
  };
}

function side(position: boolean, overrides: Partial<DebateClaimPositionSummary> = {}): DebateClaimPositionSummary {
  return {
    position,
    position_label: position ? 'Agree' : 'Disagree',
    total_count: 0,
    available_now_count: 0,
    participants: [],
    ...overrides,
  };
}

function place(
  positions: DebateClaimPositionSummary[],
  serverPosition: boolean | null,
  viewerPosition: boolean | null
) {
  return withViewerPosition({
    positions,
    responseKind: 'stance',
    serverPosition,
    viewerPosition,
    viewerSpaceId: VIEWER_SPACE,
    viewerName: 'You',
    viewerAvatarUrl: null,
  });
}

const on = (sides: DebateClaimPositionSummary[], position: boolean) =>
  sides.find(candidate => candidate.position === position)!;

/**
 * Moving the viewer onto the side they just picked, before geo-chat reports it.
 *
 * The counts and the faces have to describe the same people, because the avatar stack's "+N" is
 * the difference between them. Everything here is about not counting the viewer twice.
 */
describe('withViewerPosition', () => {
  it('adds the viewer to the count of a side that does not list them yet', () => {
    const sides = place([side(true), side(false, { total_count: 0, present_count: 0 })], null, false);

    const disagree = on(sides, false);
    expect(disagree.participants.map(p => p.profile_space_id)).toEqual([VIEWER_SPACE]);
    expect(disagree.present_count).toBe(1);
    expect(presentCount(disagree)).toBe(1);
  });

  // The reported bug. The hub's tagged rows build their sides from `online_choices`, which is
  // presence-driven and learns a position while the write is still in flight, while
  // `viewer_response` waits for the response itself. The viewer was therefore already among the
  // participants *and* absent from `serverPosition` — and the count gained a second copy of them,
  // drawing one face with a "+1" beside it on a side only the viewer held.
  it('does not count the viewer twice when the side already lists them', () => {
    const sides = place(
      [side(true), side(false, { total_count: 1, present_count: 1, participants: [participant(VIEWER_SPACE)] })],
      null,
      false
    );

    const disagree = on(sides, false);
    expect(disagree.participants).toHaveLength(1);
    expect(presentCount(disagree)).toBe(1);
    // Which is what the badge is: the remainder behind the faces, and there is none.
    expect(presentCount(disagree) - disagree.participants.length).toBe(0);
  });

  it('leaves a side the viewer never held alone', () => {
    const sides = place(
      [side(true, { total_count: 2, present_count: 2, participants: [participant(OTHER_SPACE)] }), side(false)],
      null,
      false
    );

    const agree = on(sides, true);
    expect(agree.present_count).toBe(2);
    expect(agree.participants.map(p => p.profile_space_id)).toEqual([OTHER_SPACE]);
  });

  it('takes the viewer back off the side the server still reports them on', () => {
    const sides = place(
      [
        side(true, { total_count: 1, present_count: 1, participants: [participant(VIEWER_SPACE)] }),
        side(false, { total_count: 0, present_count: 0 }),
      ],
      true,
      false
    );

    const agree = on(sides, true);
    expect(agree.participants).toHaveLength(0);
    expect(agree.present_count).toBe(0);
  });

  it('does not decrement a side that never counted the viewer', () => {
    // The mirror of the double-count: `serverPosition` disagreeing with the list must not take a
    // real person off the other side's tally.
    const sides = place(
      [side(true, { total_count: 1, present_count: 1, participants: [participant(OTHER_SPACE)] }), side(false)],
      false,
      false
    );

    const agree = on(sides, true);
    expect(agree.present_count).toBe(1);
    expect(agree.participants.map(p => p.profile_space_id)).toEqual([OTHER_SPACE]);
  });

  // Participant lists can retain the viewer after the reported position has been removed.
  it('takes the viewer off a side the list still shows them on, even once the server agrees', () => {
    const sides = place(
      [
        side(true, { total_count: 1, present_count: 1, participants: [participant(VIEWER_SPACE)] }),
        side(false, { total_count: 0, present_count: 0 }),
      ],
      null,
      null
    );

    const agree = on(sides, true);
    expect(agree.participants).toHaveLength(0);
    expect(agree.present_count).toBe(0);
  });

  // A stale participant list must not duplicate the viewer after a side change.
  it('moves the viewer off the old side when the server has already caught up with the new one', () => {
    const sides = place(
      [
        side(true, { total_count: 1, present_count: 1, participants: [participant(VIEWER_SPACE)] }),
        side(false, { total_count: 1, present_count: 1 }),
      ],
      false,
      false
    );

    expect(on(sides, true).participants).toHaveLength(0);
    expect(on(sides, false).participants.map(p => p.profile_space_id)).toEqual([VIEWER_SPACE]);
    // The server count already includes the viewer on the new side.
    expect(presentCount(on(sides, false))).toBe(1);
  });

  // Preserve referential equality when no correction is required.
  it('returns the same array when both sources already agree', () => {
    const positions = [
      side(true, { total_count: 1, present_count: 1, participants: [participant(VIEWER_SPACE)] }),
      side(false),
    ];

    expect(place(positions, true, true)).toBe(positions);
  });

  it('leaves present_count undefined where the server sent none, so the faces still answer', () => {
    const sides = place([side(true), side(false)], null, false);

    const disagree = on(sides, false);
    expect(disagree.present_count).toBeUndefined();
    // `presentCount` falls back to the face count, so the badge cannot claim a remainder.
    expect(presentCount(disagree)).toBe(1);
  });
});
