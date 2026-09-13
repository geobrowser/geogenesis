import { CancelledError } from '@tanstack/react-query';

import * as Effect from 'effect/Effect';
import { describe, expect, it } from 'vitest';

import { AbortError } from '~/core/io/subgraph/errors';

import { isSearchCancellation } from './search-cancellation';

/** The rejection `Effect.runPromise` hands back, rather than a hand-made look-alike. */
const rejectionOf = async (effect: Effect.Effect<never, unknown>): Promise<unknown> => {
  try {
    await Effect.runPromise(effect);
    throw new Error('expected the effect to fail');
  } catch (error) {
    return error;
  }
};

const live = () => new AbortController().signal;

const aborted = () => {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
};

describe('isSearchCancellation', () => {
  it('recognises our own signal being cancelled', () => {
    expect(isSearchCancellation(new Error('whatever'), aborted())).toBe(true);
  });

  it('recognises a plain AbortError', () => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';

    expect(isSearchCancellation(error, live())).toBe(true);
  });

  it('recognises one wrapped a level down', () => {
    const inner = new Error('The operation was aborted');
    inner.name = 'AbortError';

    expect(isSearchCancellation(new Error('request failed', { cause: inner }), live())).toBe(true);
  });

  // The one that actually bit. A deduplicated inner fetch, started by a query
  // that was then cancelled, rejects into whichever query is now awaiting it —
  // so our signal is live and the wrapper is Effect's, not the DOM's.
  //
  // These three go through `Effect.runPromise` rather than asserting against a
  // hand-built stand-in, because the wrapper is exactly what the code has to see
  // through: its own name is "(FiberFailure) Error", it has no `cause`, and the
  // original is reachable only through Effect's API. A stand-in that merely looks
  // the part would pass while the real rejection did not — which is how the
  // tagged case below went unnoticed.
  it("sees through Effect's wrapper to the repo's tagged AbortError, as restFetch produces", async () => {
    const rejection = await rejectionOf(Effect.fail(new AbortError()));

    expect(isSearchCancellation(rejection, live())).toBe(true);
  });

  it("sees through Effect's wrapper to a DOM AbortError arriving as a defect", async () => {
    const dom = new Error('signal is aborted without reason');
    dom.name = 'AbortError';
    const rejection = await rejectionOf(Effect.die(dom));

    expect(isSearchCancellation(rejection, live())).toBe(true);
  });

  it('treats an interrupted fiber as a cancellation', async () => {
    const rejection = await rejectionOf(Effect.interrupt as Effect.Effect<never, never>);

    expect(isSearchCancellation(rejection, live())).toBe(true);
  });

  it('still lets a genuine failure through the wrapper', async () => {
    const rejection = await rejectionOf(Effect.fail(new Error('500 Internal Server Error')));

    expect(isSearchCancellation(rejection, live())).toBe(false);
  });

  it("recognises the repo's tagged AbortError thrown directly", () => {
    expect(isSearchCancellation(new AbortError(), live())).toBe(true);
  });

  // A caller awaiting `fetchQuery` — the chat dispatcher — is rejected with this
  // when React Query cancels that query. It never reaches the `queryFn`, so it is
  // wrapped by nothing, and it is invisible to every check above: its `name` is
  // "Error" and it renders as "Error: CancelledError".
  it("recognises React Query's CancelledError, which identifies itself by neither name nor text", () => {
    const cancelled = new CancelledError();

    expect(cancelled.name).toBe('Error');
    expect(String(cancelled)).toBe('Error: CancelledError');
    expect(isSearchCancellation(cancelled)).toBe(true);
    expect(isSearchCancellation(cancelled, live())).toBe(true);
  });

  it('leaves a real failure alone, so it is still logged and reported', () => {
    expect(isSearchCancellation(new Error('500 Internal Server Error'), live())).toBe(false);
    expect(isSearchCancellation(new TypeError('Failed to fetch'), live())).toBe(false);
  });

  // A cause chain can be circular; a rejected search is the last place to hang.
  it('terminates on a circular cause chain', () => {
    const error = new Error('boom') as Error & { cause?: unknown };
    error.cause = error;

    expect(isSearchCancellation(error, live())).toBe(false);
  });

  // One caller classifies the error after the promise has been handed back, with
  // no signal in scope.
  it('works without a signal', () => {
    const error = new Error('signal is aborted without reason');
    error.name = 'FiberFailure';

    expect(isSearchCancellation(error)).toBe(true);
    expect(isSearchCancellation(new Error('500 Internal Server Error'))).toBe(false);
  });

  it('copes with whatever was thrown not being an error at all', () => {
    expect(isSearchCancellation(null, live())).toBe(false);
    expect(isSearchCancellation(undefined, live())).toBe(false);
    expect(isSearchCancellation('signal is aborted without reason', live())).toBe(true);
  });
});
