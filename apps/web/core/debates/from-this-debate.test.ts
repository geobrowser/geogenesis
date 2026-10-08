import { describe, expect, it } from 'vitest';

import { type FromThisDebateClaim, fromThisDebateCandidates, mergeFromThisDebate } from './from-this-debate';

const MATCHED = '262bea9e9298b3e1caabef450c72cfc8';
const MINTED_A = 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';
const MINTED_B = 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2';
const MINTED_C = 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3';

const turns = [
  { turn_index: 0, participant_slot: 1, attributed_space_id: 'space-daniel', speaker_name: 'Daniel', text: '…' },
  { turn_index: 1, participant_slot: 2, attributed_space_id: 'space-susan', speaker_name: 'Susan', text: '…' },
];

function claim(text: string, turn_index: number, ids: { existing?: string | null; minted?: string | null } = {}) {
  return {
    text,
    is_factual: false,
    turn_index,
    existing_entity_id: ids.existing ?? null,
    entity_id: ids.minted ?? null,
    is_contestable: true,
  };
}

function item(id: string, text: string, turnIndex = 0): FromThisDebateClaim {
  return { id, text, turnIndex, speakerName: null, speakerSpaceId: null, matched: false };
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
