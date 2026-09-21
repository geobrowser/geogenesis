import { describe, expect, it } from 'vitest';

import { errorName } from './error-name';

describe('errorName', () => {
  it('reads the name off an ordinary Error', () => {
    expect(errorName(Object.assign(new Error('nope'), { name: 'NotAllowedError' }))).toBe('NotAllowedError');
  });

  /**
   * The case `instanceof Error` gets wrong, and the reason this is read structurally: `play()`,
   * `navigator.share`, `fetch` aborts and `getUserMedia` all reject with a `DOMException`.
   */
  it('reads the name off a DOMException', () => {
    expect(errorName(new DOMException('The request is not allowed by the user agent', 'NotAllowedError'))).toBe(
      'NotAllowedError'
    );
  });

  /** A rejection from another realm is not an instance of our `Error`, but still carries a name. */
  it('reads the name off a plain object that carries one', () => {
    expect(errorName({ name: 'AbortError', message: 'aborted' })).toBe('AbortError');
  });

  it('falls back rather than throwing on anything without a name', () => {
    expect(errorName('nope')).toBe('UnknownError');
    expect(errorName(null)).toBe('UnknownError');
    expect(errorName({ name: 42 })).toBe('UnknownError');
  });
});
