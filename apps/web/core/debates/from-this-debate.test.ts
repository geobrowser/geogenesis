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

function item(id: string, text: string, turnIndex = 0, startMs: number | null = null): FromThisDebateClaim {
  return { id, text, turnIndex, startMs, speakerName: null, speakerSpaceId: null, matched: false };
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

    const rounds = groupFromThisDebateByRound(listed, claim => claim, { turnCount: 4, numberedOnly: false });

    expect(rounds.map(round => [round.label, round.items.map(claim => claim.text)])).toEqual([
      ['Round 1 · Opening', ['Round 1, first', 'Round 1, second', 'Round 1, reply']],
      ['Round 2 · Rebuttal', ['Round 2, rebuttal']],
    ]);
  });

  it('names a three-round debate’s last round as closing, and numbers Open rounds only', () => {
    const listed = [item(MINTED_A, 'Opening', 0), item(MINTED_B, 'Middle', 3), item(E, 'Last', 5)];

    expect(
      groupFromThisDebateByRound(listed, claim => claim, { turnCount: 6, numberedOnly: false }).map(r => r.label)
    ).toEqual(['Round 1 · Opening', 'Round 2 · Rebuttal', 'Round 3 · Closing']);
    expect(
      groupFromThisDebateByRound(listed, claim => claim, { turnCount: 6, numberedOnly: true }).map(r => r.label)
    ).toEqual(['Round 1', 'Round 2', 'Round 3']);
  });

  it('leaves out a round with nothing in it', () => {
    const rounds = groupFromThisDebateByRound([item(MINTED_A, 'Only', 4)], claim => claim, {
      turnCount: 6,
      numberedOnly: false,
    });

    expect(rounds.map(round => round.label)).toEqual(['Round 3 · Closing']);
  });
});
