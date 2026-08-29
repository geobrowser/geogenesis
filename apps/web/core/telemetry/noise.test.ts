import { describe, expect, it } from 'vitest';

import { isAbortedResponseStream } from './noise';

describe('isAbortedResponseStream', () => {
  it('drops the aborted-stream error Next throws when a client goes away mid-render', () => {
    expect(
      isAbortedResponseStream({
        exception: { values: [{ value: 'Error: The destination stream closed early.' }] },
      })
    ).toBe(true);
  });

  /**
   * The whole point of the filter is volume, so it has to be narrow enough that a real fault with
   * a stack in the same area still reports. A filter that swallowed these would trade one blind
   * spot for a worse one.
   */
  it('keeps other stream failures, and everything else', () => {
    for (const value of [
      'Error: The destination stream errored.',
      'Error: Premature close',
      "TypeError: Cannot read properties of undefined (reading 'replace')",
    ]) {
      expect(isAbortedResponseStream({ exception: { values: [{ value }] } })).toBe(false);
    }
  });

  it('survives events with no exception, no values, or no message', () => {
    expect(isAbortedResponseStream({})).toBe(false);
    expect(isAbortedResponseStream({ exception: {} })).toBe(false);
    expect(isAbortedResponseStream({ exception: { values: [] } })).toBe(false);
    expect(isAbortedResponseStream({ exception: { values: [{}] } })).toBe(false);
  });

  it('matches when the aborted stream is one of several exception values', () => {
    expect(
      isAbortedResponseStream({
        exception: { values: [{ value: 'Error: something else' }, { value: 'The destination stream closed early.' }] },
      })
    ).toBe(true);
  });
});
