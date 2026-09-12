import { describe, expect, it } from 'vitest';

import { isSearchCancellation } from './search-cancellation';

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
  // so our signal is live and the name is Effect's, not the DOM's.
  it("recognises Effect's wrapped abort, which carries neither our signal nor the name", () => {
    const error = new Error('signal is aborted without reason');
    error.name = 'FiberFailure';

    expect(isSearchCancellation(error, live())).toBe(true);
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
