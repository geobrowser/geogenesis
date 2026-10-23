// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { clickhouseClient, syncDebateWarehouse } from './debate-warehouse-sync';

const sources = { graphUrl: 'https://example.test/graphql', chatUrl: 'https://example.test' };
const result = {
  debate: { debate_id: 'debate', status: 'ready', turn_count: 1, claim_count: 0, unknown_claim_count: 0 },
  turns: [
    { debate_id: 'debate', turn_index: 0, start_ms: 0, end_ms: 1000, round: 'opening', speaker_space_id: 'speaker' },
  ],
  claims: [],
};
const dependencies = () => ({
  discover: vi.fn().mockResolvedValue([{ id: 'debate', transcripts: [] }]),
  read: vi.fn().mockResolvedValue(result),
});

describe('warehouse snapshot publication', () => {
  it('publishes its marker last and uses a new generation on rerun', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const first = await syncDebateWarehouse(sources, write, dependencies());
    expect(write.mock.calls.map(call => call[0])).toEqual([
      'debate_timing_turns',
      'debate_timing_debates',
      'debate_timing_generations',
    ]);
    expect(write.mock.calls.every(call => call[1][0].generation === first.generation)).toBe(true);
    const second = await syncDebateWarehouse(sources, write, dependencies());
    expect(second.generation).not.toBe(first.generation);
  });
  it('never exposes partial input after a source failure', async () => {
    const deps = dependencies();
    deps.discover.mockResolvedValue([{ id: 'first' }, { id: 'second' }]);
    deps.read.mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('network failure'));
    const write = vi.fn().mockResolvedValue(undefined);
    await expect(syncDebateWarehouse(sources, write, deps)).rejects.toThrow('network failure');
    expect(write.mock.calls.some(call => call[0] === 'debate_timing_generations')).toBe(false);
  });
  it('never publishes after an insert failure or an empty timeline corpus', async () => {
    const write = vi.fn().mockRejectedValue(new Error('write failure'));
    await expect(syncDebateWarehouse(sources, write, dependencies())).rejects.toThrow('write failure');
    const deps = dependencies();
    deps.read.mockResolvedValue({ ...result, turns: [] });
    const emptyWrite = vi.fn().mockResolvedValue(undefined);
    await expect(syncDebateWarehouse(sources, emptyWrite, deps)).rejects.toThrow('No debate timelines');
    expect(emptyWrite.mock.calls.some(call => call[0] === 'debate_timing_generations')).toBe(false);
  });
  it('waits for synchronous inserts and rejects errors in a 200 response', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('Code: 123. write failed', { status: 200 }));
    const client = clickhouseClient({
      url: 'https://warehouse.test',
      username: 'test',
      password: 'test',
      fetch: fetcher,
    });
    await expect(client.write('debate_timing_turns', [{ generation: 'fixture' }])).rejects.toThrow(
      'ClickHouse request failed'
    );
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.searchParams.get('async_insert')).toBe('0');
    expect(url.searchParams.get('wait_end_of_query')).toBe('1');
  });
});
