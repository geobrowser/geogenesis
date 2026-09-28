import { describe, expect, it, vi } from 'vitest';

import type { ExistingClaimEntity } from './claim-reuse';
import { loadMotionTopics } from './motion-topics';

const CLAIM = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE = '8b5c8625ff017732063d56e85d24dbed';
const TOPIC = 'dddddddddddddddddddddddddddddddd';

function motion(topicIds: string[]): ExistingClaimEntity {
  return { id: CLAIM, spaces: [SPACE], types: [], topicIds };
}

describe('loadMotionTopics', () => {
  it("returns the claim's topics in the debate's space", async () => {
    const lookup = vi.fn(async () => [motion([TOPIC])]);

    await expect(loadMotionTopics(CLAIM, SPACE, lookup)).resolves.toEqual([{ id: TOPIC, name: null }]);
    expect(lookup).toHaveBeenCalledWith([CLAIM], SPACE);
  });

  it('returns no topics when the claim is not in the graph', async () => {
    await expect(
      loadMotionTopics(
        CLAIM,
        SPACE,
        vi.fn(async () => [])
      )
    ).resolves.toEqual([]);
  });

  // The SDK throws on an id it cannot parse, which would fail the whole publish on every sweep.
  it('skips a topic whose id could not be written', async () => {
    const lookup = vi.fn(async () => [motion(['not-an-id', TOPIC])]);

    await expect(loadMotionTopics(CLAIM, SPACE, lookup)).resolves.toEqual([{ id: TOPIC, name: null }]);
  });

  // Topics are secondary: a failed read must not cost the debate its publish.
  it('returns no topics when the read fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lookup = vi.fn(async () => {
      throw new Error('graph down');
    });

    await expect(loadMotionTopics(CLAIM, SPACE, lookup)).resolves.toEqual([]);
  });
});
