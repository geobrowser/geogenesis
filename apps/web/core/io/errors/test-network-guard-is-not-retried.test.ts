import { describe, expect, it } from 'vitest';

import {
  TEST_UNMOCKED_NETWORK_CODE,
  classifyTransportFailure,
  isRetryableCategory,
} from './retry-utils';

/**
 * The test-run network guard in `vitest.setup.ts` must fail *once*, immediately.
 *
 * If it is ever retried, the client's exponential schedule pushes its `Exhausted retries` log about
 * 1.5s past the end of whichever test made the call, and the pending console RPC takes the whole run
 * down at worker teardown — `EnvironmentTeardownError: Closing rpc while "onUserConsoleLog" was
 * pending`, with every assertion passing and exit code 1. It blames whichever file happened to be
 * running rather than the one that made the call, so it is expensive to debug and worth pinning.
 *
 * GEO-2645 made the guard reject immediately, which was necessary but not sufficient — the retry
 * schedule put the delay back. These assert the part that closes it.
 */
describe('the test-run network guard is never retried', () => {
  const guardError = () => {
    const error = new Error('Unmocked network request in a test: https://test.example.com/graphql');
    (error as Error & { code: string }).code = TEST_UNMOCKED_NETWORK_CODE;
    return error;
  };

  it('classifies the guard error as non-retryable', () => {
    const { category } = classifyTransportFailure(guardError());

    expect(category).toBe('test_unmocked_network');
    expect(isRetryableCategory(category)).toBe(false);
  });

  it('wins over the substring heuristics that would otherwise retry it', () => {
    // The guard's message always names a URL, and the classifier reads a bare hostname as a DNS
    // failure — which is retryable. The marker has to be checked before that, not after.
    const dnsShaped = new Error('Unmocked network request in a test: https://dns.example.com/graphql');
    expect(classifyTransportFailure(dnsShaped).category).toBe('transport_dns');
    expect(isRetryableCategory('transport_dns')).toBe(true);

    (dnsShaped as Error & { code: string }).code = TEST_UNMOCKED_NETWORK_CODE;
    expect(classifyTransportFailure(dnsShaped).category).toBe('test_unmocked_network');
  });

  it('leaves real transport failures retryable', () => {
    // The fix must not quietly disarm retries for the failures they exist for.
    const reset = new Error('socket hang up');
    (reset as Error & { code: string }).code = 'ECONNRESET';

    const { category } = classifyTransportFailure(reset);
    expect(category).toBe('transport_connection_reset');
    expect(isRetryableCategory(category)).toBe(true);
  });
});
