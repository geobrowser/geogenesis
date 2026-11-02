import { describe, expect, it } from 'vitest';

import {
  type FromThisDebateClaim,
  fromThisDebateCandidates,
  groupFromThisDebateByRound,
  mergeFromThisDebate,
} from './from-this-debate';

const MATCHED = '262bea9e9298b3e1caabef450c72cfc8';
const MINTED_A = 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';
const MINTED_B = 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2';
const MINTED_C = 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3';

const turns = [
  { turn_index: 0, participant_slot: 1, attributed_space_id: 'space-daniel', speaker_name: 'Daniel', text: '…' },
  { turn_index: 1, participant_slot: 2, attributed_space_id: 'space-susan', speaker_name: 'Susan', text: '…' },
];

function claim(
  text: string,
  turn_index: number,
  ids: { existing?: string | null; minted?: string | null } = {},
  start_ms: number | null = null
) {
  return {
    text,
    is_factual: false,
    turn_index,
    start_ms,
    existing_entity_id: ids.existing ?? null,
    entity_id: ids.minted ?? null,
    is_contestable: true,
  };
}

function item(
  id: string,
  text: string,
  turnIndex = 0,
  startMs: number | null = null,
  roomTurnIndex: number | null = null
): FromThisDebateClaim {
  return { id, text, turnIndex, roomTurnIndex, startMs, speakerName: null, speakerSpaceId: null, matched: false };
}

describe('fromThisDebateCandidates', () => {
  it('uses the graph match ahead of the minted id, and the minted id otherwise', () => {
    const candidates = fromThisDebateCandidates({
      turns,
      claims: [claim('Matched', 0, { existing: MATCHED, minted: MINTED_A }), claim('Minted', 0, { minted: MINTED_B })],
    });

    expect(candidates.map(candidate => [candidate.id, candidate.matched])).toEqual([
      [MATCHED, true],
      [MINTED_B, false],
    ]);
  });

  it('skips a claim with neither id rather than inventing one', () => {
    const candidates = fromThisDebateCandidates({
      turns,
      claims: [claim('Before geo-chat minted ids', 0), claim('Minted', 1, { minted: MINTED_A })],
    });

    expect(candidates.map(candidate => candidate.text)).toEqual(['Minted']);
  });

  it('skips a malformed id and a claim classified as not contestable, keeping an unclassified one', () => {
    const candidates = fromThisDebateCandidates({
      turns,
      claims: [
        claim('Bad id', 0, { minted: 'not-an-id' }),
        { ...claim('Not a motion', 0, { minted: MINTED_A }), is_contestable: false },
        { ...claim('Older payload', 0, { minted: MINTED_B }), is_contestable: undefined },
      ],
    });

    expect(candidates.map(candidate => candidate.text)).toEqual(['Older payload']);
  });

  it('canonicalizes dashed ids, lists one id once, and orders by turn', () => {
    const dashed = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3';
    const candidates = fromThisDebateCandidates({
      turns,
      claims: [
        claim('Second turn', 1, { minted: dashed }),
        claim('First turn', 0, { existing: MATCHED }),
        claim('Also matched to it', 0, { existing: MATCHED }),
      ],
    });

    expect(candidates.map(candidate => [candidate.id, candidate.text])).toEqual([
      [MATCHED, 'First turn'],
      [MINTED_C, 'Second turn'],
    ]);
  });

  it('orders claims within a turn by when they were said, untimed ones last', () => {
    const candidates = fromThisDebateCandidates({
      turns,
      claims: [
        claim('Untimed', 0, { minted: MINTED_A }),
        claim('Later', 0, { minted: MINTED_B }, 30_000),
        claim('Earlier', 0, { minted: MINTED_C }, 5_000),
      ],
    });

    expect(candidates.map(candidate => [candidate.text, candidate.startMs])).toEqual([
      ['Earlier', 5_000],
      ['Later', 30_000],
      ['Untimed', null],
    ]);
  });

  it('names the speaker of the turn a claim came from', () => {
    const [first, second] = fromThisDebateCandidates({
      turns,
      claims: [claim('One', 0, { minted: MINTED_A }), claim('Two', 1, { minted: MINTED_B })],
    });

    expect(first).toMatchObject({ speakerName: 'Daniel', speakerSpaceId: 'space-daniel' });
    expect(second).toMatchObject({ speakerName: 'Susan', speakerSpaceId: 'space-susan' });
  });

  it('reads the room turn geo-chat placed a claim in, and null where it placed none', () => {
    const candidates = fromThisDebateCandidates({
      turns,
      claims: [
        { ...claim('Placed', 0, { minted: MINTED_A }), room_turn_index: 2 },
        { ...claim('Unplaced', 1, { minted: MINTED_B }), room_turn_index: null },
        claim('Older read', 1, { minted: MINTED_C }),
      ],
    });

    expect(candidates.map(candidate => [candidate.text, candidate.roomTurnIndex])).toEqual([
      ['Placed', 2],
      ['Unplaced', null],
      ['Older read', null],
    ]);
  });

  it('reads an empty or missing payload as no claims', () => {
    expect(fromThisDebateCandidates({ turns: [], claims: [] })).toEqual([]);
    expect(fromThisDebateCandidates(null)).toEqual([]);
  });
});

describe('mergeFromThisDebate (D4)', () => {
  it('appends new claims after the ones already listed, without reordering them', () => {
    const previous = [item(MINTED_A, 'A'), item(MINTED_B, 'B')];
    // The next payload lists B first and adds C in between: neither moves anything already shown.
    const next = [item(MINTED_B, 'B'), item(MINTED_C, 'C'), item(MINTED_A, 'A')];

    expect(mergeFromThisDebate(previous, next, new Set()).map(claim => claim.id)).toEqual([
      MINTED_A,
      MINTED_B,
      MINTED_C,
    ]);
  });

  it('updates a listed claim’s text in place', () => {
    const merged = mergeFromThisDebate(
      [item(MINTED_A, 'Draft wording'), item(MINTED_B, 'B')],
      [item(MINTED_A, 'Final wording'), item(MINTED_B, 'B')],
      new Set()
    );

    expect(merged.map(claim => claim.text)).toEqual(['Final wording', 'B']);
  });

  it('drops a claim the final pass dropped, unless somebody has a request open on it', () => {
    const previous = [item(MINTED_A, 'A'), item(MINTED_B, 'B'), item(MINTED_C, 'C')];
    const next = [item(MINTED_C, 'C')];

    expect(mergeFromThisDebate(previous, next, new Set()).map(claim => claim.id)).toEqual([MINTED_C]);
    expect(mergeFromThisDebate(previous, next, new Set([MINTED_B])).map(claim => claim.id)).toEqual([
      MINTED_B,
      MINTED_C,
    ]);
  });
});

describe('groupFromThisDebateByRound', () => {
  const D = 'd4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4';
  const E = 'e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5';

  it('groups both debaters’ turns into one round, in the order each claim was said', () => {
    // Listed append-only, so a claim the final pass found late sits at the end of the list.
    const listed = [
      item(MINTED_A, 'Round 1, second', 0, 20_000),
      item(MINTED_B, 'Round 2, rebuttal', 2, 130_000),
      item(MINTED_C, 'Round 1, reply', 1, 70_000),
      item(D, 'Round 1, first', 0, 5_000),
    ];

    const rounds = groupFromThisDebateByRound(listed, claim => claim, {
      roomTurnCount: 4,
      extractedTurnCount: 4,
      numberedOnly: false,
    });

    expect(rounds.map(round => [round.label, round.items.map(claim => claim.text)])).toEqual([
      ['Round 1 · Opening', ['Round 1, first', 'Round 1, second', 'Round 1, reply']],
      ['Round 2 · Rebuttal', ['Round 2, rebuttal']],
    ]);
  });

  it('names a three-round debate’s last round as closing, and numbers Open rounds only', () => {
    const listed = [item(MINTED_A, 'Opening', 0), item(MINTED_B, 'Middle', 3), item(E, 'Last', 5)];

    expect(
      groupFromThisDebateByRound(listed, claim => claim, {
        roomTurnCount: 6,
        extractedTurnCount: 6,
        numberedOnly: false,
      }).map(r => r.label)
    ).toEqual(['Round 1 · Opening', 'Round 2 · Rebuttal', 'Round 3 · Closing']);
    expect(
      groupFromThisDebateByRound(listed, claim => claim, {
        roomTurnCount: 6,
        extractedTurnCount: 6,
        numberedOnly: true,
      }).map(r => r.label)
    ).toEqual(['Round 1', 'Round 2', 'Round 3']);
  });

  it('draws no rounds, only the order said, when the transcript ran a different number of turns than the room', () => {
    // geo-chat numbers speaker changes over non-silent speech: a turn nobody spoke in merges the
    // turns either side of it, so transcript turn 1 here is the room's turn 3, a rebuttal.
    const listed = [item(MINTED_A, 'Rebuttal', 1, 200_000), item(MINTED_B, 'Opening', 0, 5_000)];

    const rounds = groupFromThisDebateByRound(listed, claim => claim, {
      roomTurnCount: 4,
      extractedTurnCount: 2,
      numberedOnly: false,
    });

    expect(rounds).toEqual([{ key: -1, label: null, items: [listed[1], listed[0]] }]);
  });

  it('draws rounds from the room turns geo-chat placed the claims in, whatever the transcript counted', () => {
    // The room's turn 2 went silent, so the transcript merged turns 1 and 3: by `turnIndex` the
    // rebuttal would read as round 1. Its room turn puts it in round 2.
    const listed = [
      item(MINTED_A, 'Rebuttal', 1, 200_000, 3),
      item(MINTED_B, 'Opening', 0, 5_000, 0),
      item(MINTED_C, 'Reply', 1, 70_000, 1),
    ];

    const rounds = groupFromThisDebateByRound(listed, claim => claim, {
      roomTurnCount: 4,
      extractedTurnCount: 2,
      numberedOnly: false,
    });

    expect(rounds.map(round => [round.label, round.items.map(claim => claim.text)])).toEqual([
      ['Round 1 · Opening', ['Opening', 'Reply']],
      ['Round 2 · Rebuttal', ['Rebuttal']],
    ]);
  });

  it('falls back to the transcript’s turns when any claim listed has no room turn', () => {
    const listed = [item(MINTED_A, 'Rebuttal', 1, 200_000, 3), item(MINTED_B, 'Opening', 0, 5_000, null)];

    expect(
      groupFromThisDebateByRound(listed, claim => claim, {
        roomTurnCount: 4,
        extractedTurnCount: 2,
        numberedOnly: false,
      })
    ).toEqual([{ key: -1, label: null, items: [listed[1], listed[0]] }]);
  });

  it('leaves out a round with nothing in it', () => {
    const rounds = groupFromThisDebateByRound([item(MINTED_A, 'Only', 4)], claim => claim, {
      roomTurnCount: 6,
      extractedTurnCount: 6,
      numberedOnly: false,
    });

    expect(rounds.map(round => round.label)).toEqual(['Round 3 · Closing']);
  });
});
