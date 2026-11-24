import { Effect } from 'effect';
import { parse } from 'graphql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { graphql } from './graphql-client';

const transport = vi.hoisted(() => ({ request: vi.fn(), signals: [] as Array<AbortSignal | undefined> }));
vi.mock('graphql-request', () => ({
  GraphQLClient: class {
    constructor(_url: string, options: { signal?: AbortSignal }) {
      transport.signals.push(options.signal);
    }
    request(...args: unknown[]) {
      return transport.request(...args);
    }
  },
}));
vi.mock('~/core/environment/environment', () => ({ getConfig: () => ({ api: 'https://api.test/graphql' }) }));

const query = parse('query Probe { entity(id: "x") { id } }');

/** A request that settles only when its signal aborts, as fetch does. */
function hangUntilAborted() {
  transport.request.mockImplementation(() => {
    const signal = transport.signals.at(-1)!;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  });
}

function gatewayTimeout() {
  return Object.assign(new Error('Gateway Timeout'), {
    response: { status: 504, headers: new Map([['content-type', 'text/html']]), body: '<html>504</html>' },
  });
}

type Options = { signal?: AbortSignal; timeoutMs?: number };
const run = (options: Options = {}) =>
  Effect.runPromise(graphql({ query, decoder: (data: unknown) => data, ...options }));
/** The error the call fails with. */
const failure = (options: Options) =>
  Effect.runPromise(Effect.flip(graphql({ query, decoder: (data: unknown) => data, ...options })));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  transport.request.mockReset();
  transport.signals.length = 0;
});

describe('graphql timeoutMs', () => {
  it('fails once as a timeout when the deadline passes, with no retry', async () => {
    hangUntilAborted();
    const result = failure({ timeoutMs: 9_000 });
    await vi.advanceTimersByTimeAsync(9_000);
    const error = await result;
    expect(error).toMatchObject({ isTimeout: true, isAbort: false });
    expect(error.message).toContain('timed out after 9000ms');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(transport.request).toHaveBeenCalledTimes(1);
  });

  it('leaves no request in flight once the call has ended', async () => {
    transport.request.mockImplementation(() => new Promise(() => {}));
    const result = failure({ timeoutMs: 9_000 });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(await result).toMatchObject({ isTimeout: true });
    expect(transport.signals.at(-1)?.aborted).toBe(true);
  });

  it('does not retry a 504 under a deadline', async () => {
    transport.request.mockRejectedValue(gatewayTimeout());
    const result = failure({ timeoutMs: 9_000 });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await result).toMatchObject({ status: 504 });
    expect(transport.request).toHaveBeenCalledTimes(1);
  });

  it('ends a backoff longer than the deadline at the deadline', async () => {
    transport.request.mockRejectedValue(
      Object.assign(new Error('Service Unavailable'), {
        response: { status: 503, headers: new Map([['retry-after', '20']]), body: 'busy' },
      })
    );
    const result = failure({ timeoutMs: 9_000 });
    let settled = false;
    void result.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(settled).toBe(true);
    expect(await result).toMatchObject({ isTimeout: true });
    expect(transport.request).toHaveBeenCalledTimes(1);
  });

  it('still retries a 504 without one', async () => {
    transport.request.mockRejectedValueOnce(gatewayTimeout()).mockResolvedValueOnce({ entity: { id: 'x' } });
    const result = run();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await result).toEqual({ entity: { id: 'x' } });
    expect(transport.request).toHaveBeenCalledTimes(2);
  });

  it('passes the caller abort through as an abort, and clears the deadline once settled', async () => {
    hangUntilAborted();
    const controller = new AbortController();
    const result = failure({ signal: controller.signal, timeoutMs: 9_000 });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    expect(await result).toMatchObject({ isAbort: true, isTimeout: false });
    expect(console.error).not.toHaveBeenCalled();

    transport.request.mockResolvedValue({ entity: null });
    await run({ timeoutMs: 9_000 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('hands the caller signal through untouched without a deadline', async () => {
    transport.request.mockResolvedValue({ entity: null });
    const controller = new AbortController();
    await run({ signal: controller.signal });
    expect(transport.signals.at(-1)).toBe(controller.signal);
  });
});
