import { describe, expect, it, vi } from 'vitest';

import { loadMotionTopics } from './motion-topics';

const CLAIM = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE = '8b5c8625ff017732063d56e85d24dbed';

describe('loadMotionTopics', () => {
  it("asks for the claim's topics in the debate's space", async () => {
    const lookup = vi.fn(async () => [{ id: 'dddddddddddddddddddddddddddddddd', name: 'Foreign policy' }]);

    await expect(loadMotionTopics(CLAIM, SPACE, lookup)).resolves.toEqual([
      { id: 'dddddddddddddddddddddddddddddddd', name: 'Foreign policy' },
    ]);
    expect(lookup).toHaveBeenCalledWith(CLAIM, SPACE);
  });

  it('keeps one topic per entity, however its id is written', async () => {
    const lookup = vi.fn(async () => [
      { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', name: 'Iran' },
      { id: 'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', name: 'Iran' },
    ]);

    await expect(loadMotionTopics(CLAIM, SPACE, lookup)).resolves.toEqual([
      { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', name: 'Iran' },
    ]);
  });

  // The SDK throws on an id it cannot parse, which would fail the whole publish on every sweep.
  it('skips a topic whose id could not be written', async () => {
    const lookup = vi.fn(async () => [
      { id: 'not-an-id', name: 'Broken' },
      { id: 'dddddddddddddddddddddddddddddddd', name: 'Foreign policy' },
    ]);

    await expect(loadMotionTopics(CLAIM, SPACE, lookup)).resolves.toEqual([
      { id: 'dddddddddddddddddddddddddddddddd', name: 'Foreign policy' },
    ]);
  });

  it('lets a failed read throw so the sweep retries instead of publishing without topics', async () => {
    const lookup = vi.fn(async () => {
      throw new Error('graph down');
    });

    await expect(loadMotionTopics(CLAIM, SPACE, lookup)).rejects.toThrow('graph down');
  });
});
