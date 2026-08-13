import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatExploreRelativeTime } from './explore-relative-time';

const NOW = new Date('2026-08-13T12:00:00.000Z').getTime();

afterEach(() => {
  vi.useRealTimers();
});

function atNow() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  return Math.floor(NOW / 1000);
}

describe('formatExploreRelativeTime', () => {
  // An entity that exists only as an unpublished draft has no creation time
  // until it's published; a dash there reads as loading or broken.
  it('returns null when there is no creation time', () => {
    expect(formatExploreRelativeTime(0)).toBeNull();
    expect(formatExploreRelativeTime(-1)).toBeNull();
  });

  it('formats recent timestamps', () => {
    const nowSec = atNow();

    expect(formatExploreRelativeTime(nowSec)).toBe('just now');
    expect(formatExploreRelativeTime(nowSec - 120)).toBe('2m ago');
    expect(formatExploreRelativeTime(nowSec - 2 * 3600)).toBe('2h ago');
    expect(formatExploreRelativeTime(nowSec - 3 * 86400)).toBe('3d ago');
  });
});
