import { describe, expect, it, vi } from 'vitest';

import { publishOnce } from './publish-once';

const args = { values: [], relations: [], spaceId: 'space', name: 'Publish' };
type Options = typeof args & { onSuccess?: () => void; onError?: () => void };

describe('publishOnce', () => {
  it('resolves true through the publisher success callback', async () => {
    const makeProposal = vi.fn(async (options: Options) => options.onSuccess?.());

    await expect(publishOnce(makeProposal, args)).resolves.toBe(true);
  });

  it('resolves false through the publisher error callback', async () => {
    const makeProposal = vi.fn(async (options: Options) => options.onError?.());

    await expect(publishOnce(makeProposal, args)).resolves.toBe(false);
  });
});
