import { describe, expect, it } from 'vitest';

import { TAGLINE_MAX_LENGTH, normalizeTagline, taglineLengthHint } from './profile-ontology';

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

/**
 * One sentence for both fields that write a tagline. They differ in where it sits, not in what
 * a given length means, and the over-limit half is the part worth not writing twice.
 */
describe('taglineLengthHint', () => {
  it('counts down from the limit', () => {
    expect(taglineLengthHint('')).toBe(`${TAGLINE_MAX_LENGTH} characters left`);
    expect(taglineLengthHint('Engineer at Geo')).toBe(`${TAGLINE_MAX_LENGTH - 15} characters left`);
  });

  it('says character rather than characters at one left', () => {
    expect(taglineLengthHint('y'.repeat(TAGLINE_MAX_LENGTH - 1))).toBe('1 character left');
  });

  it('reads zero left at exactly the limit', () => {
    expect(taglineLengthHint('y'.repeat(TAGLINE_MAX_LENGTH))).toBe('0 characters left');
  });

  // Both fields show an over-long stored tagline as it really is, so the hint has to explain it
  // rather than report a negative number or a stuck zero.
  it('explains an over-long tagline instead of counting past zero', () => {
    const hint = taglineLengthHint('y'.repeat(TAGLINE_MAX_LENGTH + 40));

    expect(hint).toBe(`Over the ${TAGLINE_MAX_LENGTH}-character limit — editing this will shorten it`);
    expect(hint).not.toMatch(/-\d/);
  });
});
