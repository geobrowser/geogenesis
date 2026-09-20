import { describe, expect, it } from 'vitest';

import { isLikelyEmail } from './subscribe-result';

/**
 * The same check runs on the form and in the route, so what it accepts is the contract between
 * them: the server must never reject something the client called valid, or the reader gets an error
 * on an address the form told them was fine.
 */
describe('isLikelyEmail', () => {
  it('accepts an ordinary address', () => {
    expect(isLikelyEmail('preston@geobrowser.io')).toBe(true);
  });

  it('accepts around the whitespace someone pastes in', () => {
    expect(isLikelyEmail('  preston@geobrowser.io  ')).toBe(true);
  });

  it('turns away the three things a form check is actually for', () => {
    expect(isLikelyEmail('')).toBe(false);
    expect(isLikelyEmail('   ')).toBe(false);
    expect(isLikelyEmail('preston')).toBe(false);
    expect(isLikelyEmail('preston@')).toBe(false);
  });

  // Deliberately permissive: the authority on whether an address exists is the mail sent to it, and
  // a stricter pattern only turns real people away. These are real and must not be rejected.
  it('leaves unusual but real addresses alone', () => {
    expect(isLikelyEmail('preston+debates@geobrowser.io')).toBe(true);
    expect(isLikelyEmail("o'brien@example.co.uk")).toBe(true);
    expect(isLikelyEmail('ünicode@example.com')).toBe(true);
  });

  it('refuses an address longer than the spec allows', () => {
    expect(isLikelyEmail(`${'a'.repeat(320)}@example.com`)).toBe(false);
  });
});
