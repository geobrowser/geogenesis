// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { CLAIM_END_OFFSET_PROPERTY_ID, CLAIM_START_OFFSET_PROPERTY_ID } from '../../core/debates/ontology';
import type { DebateTranscriptClaimsQuery } from '../../core/io/debate-transcript-claims-document';
import { claimsFromGraph, readDebate } from './debate-warehouse-source';
import { syncDebateWarehouse } from './debate-warehouse-sync';

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

it('does not mistake a malformed successful service response or an outage for a genuine 404', async () => {
  for (const response of [
    new Response('null'),
    new Response('[]'),
    new Response('{}'),
    new Response('', { status: 500 }),
  ]) {
    const fetcher = vi.fn().mockResolvedValue(response);
    await expect(
      readDebate(
        { graphUrl: 'https://graph.test', chatUrl: 'https://chat.test', fetch: fetcher },
        { id: 'debate', transcripts: [] }
      )
    ).rejects.toThrow();
  }
});

it('records a genuine missing service debate without inventing a timeline', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
  const result = await readDebate(
    { graphUrl: 'https://graph.test', chatUrl: 'https://chat.test', fetch: fetcher },
    { id: 'debate', transcripts: [] }
  );
  expect(result.debate.status).toBe('missing_service');
  expect(result.turns).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

function transcriptSources(sequenceIndex: unknown) {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        id: 'debate',
        turn_durations_ms: [1000],
        participants: [{ participant_slot: 1, profile_space_id: 'speaker' }],
      })
    )
    .mockResolvedValueOnce(
      Response.json({
        artifacts: [],
        turn_segments: [{ turn_index: 0, participant_slot: 1, output_start_ms: 0, output_end_ms: 1000 }],
      })
    )
    .mockResolvedValueOnce(
      Response.json({
        segments: [
          { text: 'reduces pollution', start_ms: 0, end_ms: 1000, sequence_index: sequenceIndex },
          { text: 'Solar power', start_ms: 0, end_ms: 500, sequence_index: 0 },
        ],
      })
    );
  return { graphUrl: 'https://graph.test', chatUrl: 'https://chat.test', fetch: fetcher };
}

it.each([undefined, null, '1', 'invalid', -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
  'prevents snapshot publication when a tied transcript segment has sequence_index=%s',
  async sequenceIndex => {
    const write = vi.fn().mockResolvedValue(undefined);
    await expect(
      syncDebateWarehouse(transcriptSources(sequenceIndex), write, {
        discover: async () => [{ id: 'debate', transcripts: [] }],
        read: readDebate,
      })
    ).rejects.toThrow('Invalid transcript segment');
    expect(write.mock.calls.some(call => call[0] === 'debate_timing_generations')).toBe(false);
  }
);

it('accepts zero and noncontiguous sequence indices delivered out of order with tied timestamps', async () => {
  const write = vi.fn().mockResolvedValue(undefined);
  await expect(
    syncDebateWarehouse(transcriptSources(5), write, {
      discover: async () => [{ id: 'debate', transcripts: [] }],
      read: readDebate,
    })
  ).resolves.toMatchObject({ debates: 1, turns: 1 });
  expect(write.mock.calls.at(-1)?.[0]).toBe('debate_timing_generations');
});
