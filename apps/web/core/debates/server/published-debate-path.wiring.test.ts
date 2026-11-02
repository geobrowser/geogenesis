import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { getEntityPage } from '~/core/io/queries';

import { publishedDebatePath } from './published-debate-path';

// The real lookup, not an injected one (review of #2951): the graph client sleeps between retries,
// honouring Retry-After up to 30s, and the timeout has to interrupt that sleep, not only the request.
vi.mock('~/core/io/queries', () => ({ getEntityPage: vi.fn() }));

const SPACE_ID = '4582fbbee28a16589154f7e36f1ee3c5';
const DEBATE_ID = '01a13b2c93b4702384da0926a56c265a';

describe('publishedDebatePath against the graph client (GEO-3435)', () => {
  it('gives up within its timeout even while the client waits to retry', async () => {
    // What a 503 with Retry-After: 30 looks like from outside: an Effect that sleeps, with no request
    // in flight for the abort signal to cancel.
    vi.mocked(getEntityPage).mockReturnValue(
      Effect.sleep('30 seconds').pipe(Effect.as(null)) as unknown as ReturnType<typeof getEntityPage>
    );

    const started = Date.now();
    await expect(
      publishedDebatePath(SPACE_ID, DEBATE_ID, new URLSearchParams(), { timeoutMs: 20 })
    ).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
