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
    // The viewer moves rather than appears: `present_count` describes the same population as
    // `participants` on every surface that sets it, so the side listing the viewer was counting
    // them and the side they hold was not. One off Agree, one onto Disagree.
    expect(presentCount(on(sides, true))).toBe(0);
    expect(presentCount(on(sides, false))).toBe(2);
  });

  // The held side's own population, which the correction has to keep whole. Trusting
  // `serverPosition` to mean "this side already counts the viewer" prepended a face without a
  // number, and the stack then reported fewer people than it knows about.
  it('counts the viewer onto the side they hold when the lists had them elsewhere', () => {
    const sides = place(
      [
        side(true, {
          total_count: 3,
          present_count: 3,
          participants: [participant(OTHER_SPACE), participant('019fedb3aaaa7a4f8b223d8e6f9c5521')],
        }),
        side(false, { total_count: 1, present_count: 1, participants: [participant(VIEWER_SPACE)] }),
      ],
      true,
      true
    );

    const agree = on(sides, true);
    expect(agree.participants.map(p => p.profile_space_id)[0]).toBe(VIEWER_SPACE);
    expect(presentCount(agree)).toBe(4);
    // What the "+N" behind the two rendered faces is drawn from.
    expect(presentCount(agree) - 2).toBe(2);
    expect(presentCount(on(sides, false))).toBe(0);
  });

  // "geo-chat has not answered" is not "the viewer holds nothing". The rematch picker draws
  // graph-derived sides for claims geo-chat has no row for, and stripping them there took the
  // viewer off the side the graph says they hold.
  it('leaves the lists alone when the server has given no answer', () => {
    const positions = [
      side(true, { total_count: 1, present_count: 1, participants: [participant(VIEWER_SPACE)] }),
      side(false),
    ];

    const sides = withViewerPosition({
      positions,
      responseKind: 'stance',
      serverPosition: undefined,
      viewerPosition: null,
      viewerSpaceId: VIEWER_SPACE,
      viewerName: 'You',
      viewerAvatarUrl: null,
    });

    expect(sides).toBe(positions);
  });

  // Preserve referential equality when no correction is required. Both sources agreeing is not
  // enough on its own — the list has to agree too, which is what the next test is about.
  it('returns the same array when both sources already agree', () => {
    const positions = [
      side(true, { total_count: 1, present_count: 1, participants: [participant(VIEWER_SPACE)] }),
      side(false),
    ];

    expect(place(positions, true, true)).toBe(positions);
  });

  /**
   * GEO-2821. `participants` is geo-chat's presence view and lists a viewer only where it has a
   * readiness row for them, which a position taken before GEO-2740 does not have. Agreeing about
   * the position was treated as nothing left to do, so on those claims the viewer's own face never
   * appeared — while a claim whose readiness had been repaired drew it, from one online status.
   */
  it('adds the viewer to the side they hold when the list omits them, even once the server agrees', () => {
    const sides = place(
      [
        side(true, { total_count: 5, present_count: 2, participants: [participant(OTHER_SPACE)] }),
        side(false, { total_count: 1, present_count: 0 }),
      ],
      true,
      true
    );

    const agree = on(sides, true);
    expect(agree.participants.map(p => p.profile_space_id)).toEqual([VIEWER_SPACE, OTHER_SPACE]);
    // The presence count follows the list it describes, so the badge cannot claim a remainder of
    // zero behind two faces.
    expect(agree.present_count).toBe(3);
    // The on-chain total already counts the viewer's own response — `serverPosition` says so — so
    // it is not bumped a second time.
    expect(agree.total_count).toBe(5);
  });

  // The mirror of it: a side the viewer does not hold loses nothing it never listed them on.
  it('leaves the other side alone when the list never had the viewer', () => {
    const sides = place(
      [
        side(true, { total_count: 5, present_count: 2, participants: [participant(OTHER_SPACE)] }),
        side(false, { total_count: 1, present_count: 1, participants: [participant(OTHER_SPACE)] }),
      ],
      true,
      true
    );

    const disagree = on(sides, false);
    expect(disagree.present_count).toBe(1);
    expect(disagree.total_count).toBe(1);
  });

  it('leaves present_count undefined where the server sent none, so the faces still answer', () => {
    const sides = place([side(true), side(false)], null, false);

    const disagree = on(sides, false);
    expect(disagree.present_count).toBeUndefined();
    // `presentCount` falls back to the face count, so the badge cannot claim a remainder.
    expect(presentCount(disagree)).toBe(1);
  });
});
