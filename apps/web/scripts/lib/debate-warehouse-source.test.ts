// @vitest-environment node
import { expect, it } from 'vitest';

import { CLAIM_END_OFFSET_PROPERTY_ID, CLAIM_START_OFFSET_PROPERTY_ID } from '../../core/debates/ontology';
import type { DebateTranscriptClaimsQuery } from '../../core/io/debate-transcript-claims-document';
import { claimsFromGraph } from './debate-warehouse-source';

it('retains both speakers of a reused claim and deduplicates repeated graph blocks', () => {
  const blocks = [0, 1].map(i => ({
    toEntity: {
      id: `block-${i}`,
      authors: [{ toEntity: { id: `speaker-${i}` } }],
      claims: [
        {
          entityId: `relation-${i}`,
          entity: {
            valuesList: [
              { propertyId: CLAIM_START_OFFSET_PROPERTY_ID, integer: String(i * 1000) },
              { propertyId: CLAIM_END_OFFSET_PROPERTY_ID, integer: String(i * 1000 + 500) },
            ],
          },
          toEntity: { id: 'same-claim', name: 'Shared claim', names: [{ spaceId: 'space', text: 'Shared claim' }] },
        },
      ],
    },
  }));
  const data: DebateTranscriptClaimsQuery = {
    entity: { transcripts: [{ toEntity: { id: 'transcript', blocks: [...blocks, blocks[0]] } }] },
  };
  const turns = [0, 1].map(i => ({
    debate_id: 'debate',
    turn_index: i,
    start_ms: i * 1000,
    end_ms: i * 1000 + 1000,
    round: 'opening',
    speaker_space_id: `speaker${i}`,
  }));
  const claims = claimsFromGraph(data, 'debate', 'space', [], turns);
  expect(claims).toHaveLength(2);
  expect(claims.map(c => [c.claim_id, c.speaker_space_id, c.start_ms])).toEqual([
    ['sameclaim', 'speaker0', 0],
    ['sameclaim', 'speaker1', 1000],
  ]);
});
