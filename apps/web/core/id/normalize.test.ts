import { describe, expect, it } from 'vitest';

import { equals, uuidToHex } from './normalize';

describe('uuidToHex', () => {
  it('removes dashes and lowercases', () => {
    expect(uuidToHex('4C81561D-1F95-4131-9CDD-DD20AB831BA2')).toBe('4c81561d1f9541319cdddd20ab831ba2');
  });

  it('lowercases already undashed IDs', () => {
    expect(uuidToHex('4C81561D1F9541319CDDDD20AB831BA2')).toBe('4c81561d1f9541319cdddd20ab831ba2');
  });

  it('handles already normalized IDs', () => {
    expect(uuidToHex('4c81561d1f9541319cdddd20ab831ba2')).toBe('4c81561d1f9541319cdddd20ab831ba2');
  });

  it('handles empty string', () => {
    expect(uuidToHex('')).toBe('');
  });
});

describe('equals', () => {
  it('matches dashed UUID to undashed hex', () => {
    expect(equals('4c81561d-1f95-4131-9cdd-dd20ab831ba2', '4c81561d1f9541319cdddd20ab831ba2')).toBe(true);
  });

  it('matches regardless of case', () => {
    expect(equals('4C81561D-1F95-4131-9CDD-DD20AB831BA2', '4c81561d1f9541319cdddd20ab831ba2')).toBe(true);
  });

  it('matches two dashed UUIDs', () => {
    expect(equals('4c81561d-1f95-4131-9cdd-dd20ab831ba2', '4c81561d-1f95-4131-9cdd-dd20ab831ba2')).toBe(true);
  });

  it('matches two undashed hex IDs', () => {
    expect(equals('4c81561d1f9541319cdddd20ab831ba2', '4c81561d1f9541319cdddd20ab831ba2')).toBe(true);
  });

  it('returns false for different IDs', () => {
    expect(equals('4c81561d-1f95-4131-9cdd-dd20ab831ba2', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(false);
  });

  it('handles empty strings', () => {
    expect(equals('', '')).toBe(true);
    expect(equals('', 'abc')).toBe(false);
  });
});
