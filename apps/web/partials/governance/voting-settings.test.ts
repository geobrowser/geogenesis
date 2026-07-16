import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VOTING_SETTINGS_SNAPSHOT,
  type RawVotingSettings,
  type VotingSettingsFormState,
  parseVotingSettingsForm,
  rawVotingSettingsToSnapshot,
  snapshotToFormState,
  snapshotToHidden,
  votingSettingsWarnings,
} from './voting-settings';

const RATIO_BASE = 10_000_000n; // 1e7 — 100%

const rawFixture: RawVotingSettings = {
  partialPercentageSupportThreshold: (RATIO_BASE * 51n) / 100n, // 51%
  universalPercentageSupportThreshold: (RATIO_BASE * 90n) / 100n, // 90%
  flatSupportThreshold: 2n,
  quorum: 3n,
  duration: BigInt(24 * 60 * 60 + 2 * 60 * 60 + 30 * 60 + 15), // 1d 2h 30m 15s
  executionGracePeriod: BigInt(14 * 24 * 60 * 60), // 14 days
  disableFastPathAccessForNewMembers: true,
};

const hidden = snapshotToHidden(DEFAULT_VOTING_SETTINGS_SNAPSHOT);

describe('rawVotingSettingsToSnapshot', () => {
  it('converts ratios to percentages and durations to seconds/days', () => {
    const snapshot = rawVotingSettingsToSnapshot(rawFixture);
    expect(snapshot.partialPercent).toBe(51);
    expect(snapshot.universalPercent).toBe(90);
    expect(snapshot.flat).toBe(2);
    expect(snapshot.quorum).toBe(3);
    expect(snapshot.durationSeconds).toBe(24 * 60 * 60 + 2 * 60 * 60 + 30 * 60 + 15);
    expect(snapshot.graceDays).toBe(14);
    expect(snapshot.disableFastPathForNewMembers).toBe(true);
  });
});

describe('snapshotToFormState', () => {
  it('splits the duration into days/hours/minutes/seconds', () => {
    const form = snapshotToFormState(rawVotingSettingsToSnapshot(rawFixture));
    expect(form).toMatchObject({
      slowPathThresholdPercent: '51',
      durationDays: '1',
      durationHours: '2',
      durationMinutes: '30',
      durationSeconds: '15',
      fastPathVotes: '2',
      quorum: '3',
    });
  });
});

describe('parseVotingSettingsForm', () => {
  const validForm: VotingSettingsFormState = {
    slowPathThresholdPercent: '51',
    durationDays: '1',
    durationHours: '0',
    durationMinutes: '0',
    durationSeconds: '0',
    fastPathVotes: '1',
    quorum: '1',
  };

  it('accepts a valid form and preserves hidden fields', () => {
    const result = parseVotingSettingsForm(validForm, hidden);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.value).toMatchObject({
      partialPercentageSupportThreshold: 51,
      universalPercentageSupportThreshold: hidden.universalPercent,
      flatSupportThreshold: 1,
      quorum: 1,
      durationInSeconds: 86400,
      executionGracePeriodInDays: hidden.graceDays,
      disableFastPathAccessForNewMembers: hidden.disableFastPathForNewMembers,
    });
  });

  it('sums days/hours/minutes/seconds into durationInSeconds', () => {
    const result = parseVotingSettingsForm(
      { ...validForm, durationDays: '0', durationHours: '1', durationMinutes: '30', durationSeconds: '10' },
      hidden
    );
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.value.durationInSeconds).toBe(3600 + 30 * 60 + 10);
  });

  it('rejects blank fields before they coerce to 0', () => {
    const result = parseVotingSettingsForm({ ...validForm, slowPathThresholdPercent: '' }, hidden);
    expect(result).toEqual({ kind: 'error', message: 'All fields are required.' });
  });

  it('rejects a threshold above 100%', () => {
    const result = parseVotingSettingsForm({ ...validForm, slowPathThresholdPercent: '150' }, hidden);
    expect(result.kind).toBe('error');
  });

  it('rejects a total duration under 1 minute', () => {
    const result = parseVotingSettingsForm(
      { ...validForm, durationDays: '0', durationHours: '0', durationMinutes: '0', durationSeconds: '30' },
      hidden
    );
    expect(result).toEqual({ kind: 'error', message: 'Vote duration must be at least 1 minute.' });
  });

  it('rejects a quorum below 1', () => {
    const result = parseVotingSettingsForm({ ...validForm, quorum: '0' }, hidden);
    expect(result.kind).toBe('error');
  });

  it('rejects a non-integer fast path vote count', () => {
    const result = parseVotingSettingsForm({ ...validForm, fastPathVotes: '1.5' }, hidden);
    expect(result.kind).toBe('error');
  });

  it('rejects a fast path vote count below 1', () => {
    const result = parseVotingSettingsForm({ ...validForm, fastPathVotes: '0' }, hidden);
    expect(result).toEqual({ kind: 'error', message: 'Fast path votes must be at least 1.' });
  });

  it('enforces the editor count when provided (create flow)', () => {
    // Only one initial editor, so quorum=3 must be rejected up front.
    const result = parseVotingSettingsForm({ ...validForm, quorum: '3' }, hidden, 1);
    expect(result.kind).toBe('error');
  });

  it('allows a high quorum when the editor count is unknown (edit flow)', () => {
    const result = parseVotingSettingsForm({ ...validForm, quorum: '3' }, hidden);
    expect(result.kind).toBe('ok');
  });

  it('round-trips a snapshot through the form back to an equivalent input', () => {
    const snapshot = rawVotingSettingsToSnapshot(rawFixture);
    const result = parseVotingSettingsForm(snapshotToFormState(snapshot), snapshotToHidden(snapshot));
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.value.durationInSeconds).toBe(snapshot.durationSeconds);
    expect(result.value.partialPercentageSupportThreshold).toBe(51);
  });
});

describe('votingSettingsWarnings', () => {
  it('warns on a likely-decimal threshold', () => {
    const warnings = votingSettingsWarnings({
      slowPathThresholdPercent: '0.5',
      durationDays: '1',
      durationHours: '0',
      durationMinutes: '0',
      durationSeconds: '0',
      fastPathVotes: '1',
      quorum: '1',
    });
    expect(warnings.length).toBeGreaterThan(0);
  });
});
