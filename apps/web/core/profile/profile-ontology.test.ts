import { describe, expect, it } from 'vitest';

import { TAGLINE_MAX_LENGTH, normalizeTagline } from './profile-ontology';

/**
 * The limit is the app's, not the graph's — a tagline written by any other client can be longer.
 * Every field that writes one runs its value through here, so this is the only place the rule is
 * stated and the only place it can drift from.
 */
describe('normalizeTagline', () => {
  it('leaves a tagline inside the limit alone', () => {
    expect(normalizeTagline('Engineer at Geo')).toBe('Engineer at Geo');
  });

  it('cuts a tagline over the limit to it', () => {
    expect(normalizeTagline('y'.repeat(TAGLINE_MAX_LENGTH + 40))).toHaveLength(TAGLINE_MAX_LENGTH);
  });

  // Cut rather than rejected: a pasted 400-character headline is somebody with something to
  // shorten, and keeping the first 220 leaves them something to edit.
  it('keeps the start of a tagline it cuts', () => {
    expect(normalizeTagline(`Engineer at Geo${'y'.repeat(TAGLINE_MAX_LENGTH)}`)).toMatch(/^Engineer at Geo/);
  });

  it('matches LinkedIn at 220 characters', () => {
    expect(TAGLINE_MAX_LENGTH).toBe(220);
  });
});
