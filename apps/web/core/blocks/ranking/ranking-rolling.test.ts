import { describe, expect, it } from 'vitest';

import {
  formatRollingSubmissionLabel,
  getRollingExpiryMs,
  parseTimestampMs,
  shouldMintNewRankEntity,
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

describe('getRollingExpiryMs', () => {
  it('adds the frequency window to the submission time', () => {
    expect(getRollingExpiryMs(now, 24)).toBe(now + 24 * HOUR);
  });
});

describe('shouldMintNewRankEntity', () => {
  it('mints when the author has no ballot yet', () => {
    expect(shouldMintNewRankEntity({ isRolling: false, hasExistingBallot: false, isSubmissionLive: true })).toBe(true);
    expect(shouldMintNewRankEntity({ isRolling: true, hasExistingBallot: false, isSubmissionLive: false })).toBe(true);
  });

  it('updates in place while a ballot is still live', () => {
    expect(shouldMintNewRankEntity({ isRolling: true, hasExistingBallot: true, isSubmissionLive: true })).toBe(false);
  });

  // A rolled-off ballot needs a fresh `submitted_at`, and the indexer only derives
  // one from the edit that creates the rank entity — updating in place would leave
  // the ballot expired forever.
  it('mints again once a rolling ballot has rolled off', () => {
    expect(shouldMintNewRankEntity({ isRolling: true, hasExistingBallot: true, isSubmissionLive: false })).toBe(true);
  });

  it('never mints for a non-rolling block with an existing ballot', () => {
    expect(shouldMintNewRankEntity({ isRolling: false, hasExistingBallot: true, isSubmissionLive: false })).toBe(false);
  });
});

describe('formatRollingSubmissionLabel', () => {
  it('returns null without a submission', () => {
    expect(
      formatRollingSubmissionLabel({ hasSubmission: false, isLive: true, submittedAtMs: now, frequencyHours: 24, now })
    ).toBeNull();
  });

  it('hides the label once the submission has rolled off', () => {
    expect(
      formatRollingSubmissionLabel({ hasSubmission: true, isLive: false, submittedAtMs: now, frequencyHours: 24, now })
    ).toBeNull();
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
    ).toBe('Vote again in 4 hrs');
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
    ).toBe('Vote again in 7 days');
  });

  it('shows a negative countdown when the backend still considers an elapsed submission live', () => {
    expect(
      formatRollingSubmissionLabel({
        hasSubmission: true,
        isLive: true,
        submittedAtMs: now - 30 * HOUR,
        frequencyHours: 24,
        now,
      })
    ).toBe('Vote again in -6 hrs');
  });
});
