import { describe, expect, it, vi } from 'vitest';

import { createBatchLoader } from './batch-loader';

function loader(maxBatchSize = 25) {
  const fetchBatch = vi.fn(
    async (keys: string[]) => new Map(keys.filter(key => key !== 'gone').map(key => [key, `v:${key}`]))
  );
  const load = createBatchLoader<string>({ fetchBatch, missing: key => `missing:${key}`, maxBatchSize });
  return { fetchBatch, load };
}

describe('createBatchLoader', () => {
  it('sends every key asked for in the same tick as one batch', async () => {
    // A feed page of cards, each asking for its own space.
    const { fetchBatch, load } = loader();
    const values = await Promise.all(['a', 'b', 'c'].map(load));

    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(fetchBatch).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(values).toEqual(['v:a', 'v:b', 'v:c']);
  });

  it('asks for a repeated key once and answers every asker', async () => {
    const { fetchBatch, load } = loader();
    const values = await Promise.all([load('a'), load('a')]);

    expect(fetchBatch).toHaveBeenCalledWith(['a']);
    expect(values).toEqual(['v:a', 'v:a']);
  });

  it('splits a large tick into batches of the maximum size', async () => {
    const { fetchBatch, load } = loader(2);
    await Promise.all(['a', 'b', 'c'].map(load));

    expect(fetchBatch.mock.calls).toEqual([[['a', 'b']], [['c']]]);
  });

  it("answers a key the batch didn't return with its fallback", async () => {
    const { load } = loader();

    expect(await load('gone')).toBe('missing:gone');
  });

  it('rejects every key in a failed batch', async () => {
    const load = createBatchLoader<string>({
      fetchBatch: async () => Promise.reject(new Error('offline')),
      missing: () => '',
      maxBatchSize: 25,
    });

    await expect(Promise.all([load('a'), load('b')])).rejects.toThrow('offline');
  });

  it('starts a new batch on a later tick', async () => {
    const { fetchBatch, load } = loader();
    await load('a');
    await load('b');

    expect(fetchBatch).toHaveBeenCalledTimes(2);
  });
});
