import { describe, expect, it } from 'vitest';

import { heldRecordFor, heldTopicsFor } from './onboarding-feed-topics';

const topic = { id: 'topic-a', name: 'Energy' };

describe('held onboarding topics', () => {
  it('compares wallet addresses case-insensitively and preserves valid picks', () => {
    expect(heldTopicsFor({ address: '0xAbC', topics: [topic] }, '0xabc')).toEqual([topic]);
    expect(heldTopicsFor({ address: '0xAbC', topics: [topic] }, '0xdef')).toEqual([]);
  });

  it.each([null, 'topic-a', {}, { id: null, name: 'Energy' }, { id: 'topic-a' }, { id: '', name: 'Energy' }])(
    'ignores a malformed persisted topic: %j',
    invalid => {
      expect(heldTopicsFor({ address: '0xA', topics: [invalid] }, '0xa')).toEqual([]);
    }
  );

  it.each([NaN, Infinity, 'yesterday', -1])('ignores an invalid submission timestamp: %s', submittedAt => {
    expect(heldRecordFor({ address: '0xA', topics: [topic], submittedAt }, '0xa')?.submittedAt).toBeUndefined();
  });
});
