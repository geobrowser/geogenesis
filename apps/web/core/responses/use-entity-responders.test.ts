import { describe, expect, it } from 'vitest';

import { applyOptimisticViewerResponse } from './use-entity-responders';

const indexed = [
  { userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', direction: 'negative' as const },
  { userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', direction: 'positive' as const },
];

describe('applyOptimisticViewerResponse', () => {
  it('moves the viewer from their indexed side to their optimistic side', () => {
    expect(applyOptimisticViewerResponse(indexed, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'positive')).toEqual([
      { userId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', direction: 'positive' },
      { userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', direction: 'positive' },
    ]);
  });

  it('removes a cleared viewer response', () => {
    expect(applyOptimisticViewerResponse(indexed, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', null)).toEqual([
      { userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', direction: 'positive' },
    ]);
  });

  it('preserves the indexed list when no optimistic answer was supplied', () => {
    expect(applyOptimisticViewerResponse(indexed, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(indexed);
  });
});
