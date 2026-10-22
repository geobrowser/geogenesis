import { describe, expect, it } from 'vitest';

import { toOwnSchedule } from './own-schedule-deep-link';

describe('toOwnSchedule', () => {
  it('adds the trigger to the current URL, keeping its query and fragment', () => {
    expect(toOwnSchedule('https://www.geobrowser.io/space/abc?tab=x#top')).toBe(
      'https://www.geobrowser.io/space/abc?tab=x&modal=schedule#top'
    );
  });

  it('works on a bare path', () => {
    expect(toOwnSchedule('http://localhost:3002/explore')).toBe('http://localhost:3002/explore?modal=schedule');
  });
});
