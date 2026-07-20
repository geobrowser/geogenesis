import { describe, expect, it } from 'vitest';

import type { AggregatedRankingSubmitterRef } from './ranking-block-relations';
import {
  formatRollingSubmissionLabel,
  getRollingExpiryMs,
  isCreatedWithinWindow,
  isRollingSubmissionLive,
  parseTimestampMs,
} from './ranking-rolling';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-06-04T12:00:00.000Z').getTime();

describe('parseTimestampMs', () => {
  it('treats small numbers as unix seconds', () => {
    expect(parseTimestampMs(1_700_000_000)).toBe(1_700_000_000 * 1000);
  });

  it('treats large numbers as millis', () => {
    expect(parseTimestampMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('parses ISO strings', () => {
    expect(parseTimestampMs('2026-06-04T12:00:00.000Z')).toBe(now);
  });

  it('returns 0 for empty/invalid input', () => {
    expect(parseTimestampMs('')).toBe(0);
    expect(parseTimestampMs(null)).toBe(0);
    expect(parseTimestampMs('not-a-date')).toBe(0);
  });
});

describe('isRollingSubmissionLive', () => {
  const refs: AggregatedRankingSubmitterRef[] = [
    { rankEntityId: 'rank-a', spaceId: 'space-a' },
    { rankEntityId: 'rank-b', spaceId: 'space-b' },
  ];

  it('is live when the personal space is still aggregated', () => {
    expect(
      isRollingSubmissionLive({ personalSpaceId: 'space-b', myRankEntityId: 'other', aggregatedSubmitterRefs: refs })
    ).toBe(true);
  });

  it('is live when the rank entity id is still aggregated', () => {
    expect(
      isRollingSubmissionLive({ personalSpaceId: 'unknown', myRankEntityId: 'rank-a', aggregatedSubmitterRefs: refs })
    ).toBe(true);
  });

  it('is not live when neither the space nor the rank entity is aggregated (rolled off)', () => {
    expect(
      isRollingSubmissionLive({ personalSpaceId: 'space-z', myRankEntityId: 'rank-z', aggregatedSubmitterRefs: refs })
    ).toBe(false);
  });

  it('is not live without any identifying id', () => {
    expect(
      isRollingSubmissionLive({ personalSpaceId: null, myRankEntityId: null, aggregatedSubmitterRefs: refs })
    ).toBe(false);
  });
});

describe('isCreatedWithinWindow', () => {
  it('keeps entities created inside the window', () => {
    expect(isCreatedWithinWindow(now - 2 * HOUR, 24, now)).toBe(true);
  });

  it('drops entities created before the window', () => {
    expect(isCreatedWithinWindow(now - 48 * HOUR, 24, now)).toBe(false);
  });

  it('keeps entities with an unknown creation time', () => {
    expect(isCreatedWithinWindow(undefined, 24, now)).toBe(true);
    expect(isCreatedWithinWindow('', 24, now)).toBe(true);
  });
});

describe('getRollingExpiryMs', () => {
  it('adds the frequency window to the submission time', () => {
    expect(getRollingExpiryMs(now, 24)).toBe(now + 24 * HOUR);
  });
});

describe('formatRollingSubmissionLabel', () => {
  it('returns null without a submission', () => {
    expect(
      formatRollingSubmissionLabel({ hasSubmission: false, isLive: true, submittedAtMs: now, frequencyHours: 24, now })
    ).toBeNull();
  });

  it('prompts a fresh submission once rolled off', () => {
    expect(
      formatRollingSubmissionLabel({ hasSubmission: true, isLive: false, submittedAtMs: now, frequencyHours: 24, now })
    ).toBe('Your ranking has rolled off — submit a fresh ranking');
  });

  it('shows an hours countdown while live', () => {
    expect(
      formatRollingSubmissionLabel({
        hasSubmission: true,
        isLive: true,
        submittedAtMs: now - 20 * HOUR,
        frequencyHours: 24,
        now,
      })
    ).toBe('Your ranking expires in 4 hrs');
  });

  it('shows a days countdown for long windows', () => {
    expect(
      formatRollingSubmissionLabel({
        hasSubmission: true,
        isLive: true,
        submittedAtMs: now,
        frequencyHours: 168,
        now,
      })
    ).toBe('Your ranking expires in 7 days');
  });

  it('rolls off when the window has elapsed even if flagged live', () => {
    expect(
      formatRollingSubmissionLabel({
        hasSubmission: true,
        isLive: true,
        submittedAtMs: now - 30 * HOUR,
        frequencyHours: 24,
        now,
      })
    ).toBe('Your ranking has rolled off — submit a fresh ranking');
  });
});
