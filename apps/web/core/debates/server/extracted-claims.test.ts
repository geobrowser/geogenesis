import { describe, expect, it } from 'vitest';

import { decodeExtractedClaims } from './extracted-claims';

const turn = { turn_index: 0, participant_slot: 0, attributed_space_id: 'space-a', speaker_name: 'A', text: 'hello' };

describe('decodeExtractedClaims topics', () => {
  it('maps topic rows to {id, name}, dropping blank ids and defaulting absent topics', () => {
    const { claims } = decodeExtractedClaims({
      turns: [turn],
      claims: [
        {
          text: 'With topics',
          is_factual: true,
          turn_index: 0,
          topics: [
            { entity_id: '27b73193ecea48fdaa46fdee40c0b717', name: 'AI and mental health' },
            // Drift guard: a row without a usable id must not become an empty entity reference.
            { entity_id: '   ', name: 'Blank id' },
          ],
        },
        // A payload from before topic assignment shipped has no `topics` key at all.
        { text: 'Without topics', is_factual: null, turn_index: 0 },
      ],
    });
    expect(claims[0].topics).toEqual([{ id: '27b73193ecea48fdaa46fdee40c0b717', name: 'AI and mental health' }]);
    expect(claims[1].topics).toEqual([]);
  });
});
