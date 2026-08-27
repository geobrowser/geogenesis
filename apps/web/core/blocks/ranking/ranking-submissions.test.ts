import { describe, expect, it } from 'vitest';

import { emptySubmissionsBlob, parseSubmissionsBlob } from './ranking-submissions';

describe('parseSubmissionsBlob', () => {
  it('returns empty blob for invalid input', () => {
    expect(parseSubmissionsBlob('')).toEqual(emptySubmissionsBlob());
    expect(parseSubmissionsBlob('{bad')).toEqual(emptySubmissionsBlob());
  });
});
