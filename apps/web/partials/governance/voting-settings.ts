import { getCreateDaoSpaceCalldata, validateVotingSettingsInput } from '@geoprotocol/geo-sdk';

/** The SDK doesn't re-export `VotingSettingsInput` from its public entry, so we derive it
 *  from the function signature we already depend on — same trick as use-deploy-space. */
export type VotingSettingsInput = Parameters<typeof getCreateDaoSpaceCalldata>[0]['votingSettings'];

/** 100% maps to RATIO_BASE (1e7) on-chain, so a ratio divided by 100000 is its percentage.
 *  Matches the governance page's formatThreshold and the SDK's percentageToRatio. */
const RATIO_TO_PERCENT_DIVISOR = 100000;
const SECONDS_PER_DAY = 86400;

/**
 * Plain, client-serializable view of a DAO space's on-chain voting settings.
 * The raw contract struct is all bigints, which Next.js can't hand from a server
 * component to a client one — so the server page converts to this first.
 */
export type VotingSettingsSnapshot = {
  /** Slow-path pass threshold, as a percentage (0–100). */
  partialPercent: number;
  /** Universal (early-execution) threshold — not shown in the form, preserved on edit. */
  universalPercent: number;
  /** Fast-path: number of editor votes for instant execution. */
  flat: number;
  quorum: number;
  durationSeconds: number;
  /** Execution grace period in days — not shown in the form, preserved on edit. */
  graceDays: number;
  /** Not shown in the form, preserved on edit. */
  disableFastPathForNewMembers: boolean;
};

/** Raw on-chain `votingSettings` struct shape (bigints). */
export type RawVotingSettings = {
  partialPercentageSupportThreshold: bigint;
  universalPercentageSupportThreshold: bigint;
  flatSupportThreshold: bigint;
  quorum: bigint;
  duration: bigint;
  executionGracePeriod: bigint;
  disableFastPathAccessForNewMembers: boolean;
};

/** Convert the raw contract struct to a plain snapshot. Pure — safe to call server-side. */
export function rawVotingSettingsToSnapshot(raw: RawVotingSettings): VotingSettingsSnapshot {
  return {
    partialPercent: Number(raw.partialPercentageSupportThreshold) / RATIO_TO_PERCENT_DIVISOR,
    universalPercent: Number(raw.universalPercentageSupportThreshold) / RATIO_TO_PERCENT_DIVISOR,
    flat: Number(raw.flatSupportThreshold),
    quorum: Number(raw.quorum),
    durationSeconds: Number(raw.duration),
    graceDays: Number(raw.executionGracePeriod) / SECONDS_PER_DAY,
    disableFastPathForNewMembers: raw.disableFastPathAccessForNewMembers,
  };
}

/** The four fields the design exposes, held as strings while the user types. */
export type VotingSettingsFormState = {
  slowPathThresholdPercent: string;
  durationDays: string;
  durationHours: string;
  durationMinutes: string;
  durationSeconds: string;
  fastPathVotes: string;
  quorum: string;
};

/** Fields the form doesn't expose but the SDK still requires; carried through unchanged. */
export type HiddenVotingSettings = {
  universalPercent: number;
  graceDays: number;
  disableFastPathForNewMembers: boolean;
};

/**
 * Create-time defaults. Mirrors NEW_SPACE_DEFAULT_VOTING_SETTINGS in use-deploy-space
 * (a 1-day voting window so new DAOs are usable immediately). Duplicated here rather
 * than imported so this module stays free of client-only dependencies.
 */
export const DEFAULT_VOTING_SETTINGS_SNAPSHOT: VotingSettingsSnapshot = {
  partialPercent: 51,
  universalPercent: 90,
  flat: 1,
  quorum: 1,
  durationSeconds: SECONDS_PER_DAY,
  graceDays: 14,
  disableFastPathForNewMembers: true,
};

/** Convert a VotingSettingsInput (as stored during create-space) back to a snapshot. */
export function votingSettingsInputToSnapshot(input: VotingSettingsInput): VotingSettingsSnapshot {
  const durationSeconds =
    'durationInSeconds' in input && typeof input.durationInSeconds === 'number'
      ? input.durationInSeconds
      : 'durationInDays' in input && typeof input.durationInDays === 'number'
        ? Math.round(input.durationInDays * SECONDS_PER_DAY)
        : DEFAULT_VOTING_SETTINGS_SNAPSHOT.durationSeconds;

  return {
    partialPercent: input.partialPercentageSupportThreshold,
    universalPercent: input.universalPercentageSupportThreshold,
    flat: input.flatSupportThreshold,
    quorum: input.quorum,
    durationSeconds,
    graceDays: input.executionGracePeriodInDays,
    disableFastPathForNewMembers: input.disableFastPathAccessForNewMembers,
  };
}

function splitSeconds(totalSeconds: number) {
  const whole = Math.max(0, Math.round(totalSeconds));
  const days = Math.floor(whole / SECONDS_PER_DAY);
  let rem = whole - days * SECONDS_PER_DAY;
  const hours = Math.floor(rem / 3600);
  rem -= hours * 3600;
  const minutes = Math.floor(rem / 60);
  const seconds = rem - minutes * 60;
  return { days, hours, minutes, seconds };
}

function roundPercent(n: number): number {
  return Math.round(n * 10) / 10;
}

export function snapshotToFormState(snapshot: VotingSettingsSnapshot): VotingSettingsFormState {
  const { days, hours, minutes, seconds } = splitSeconds(snapshot.durationSeconds);
  return {
    slowPathThresholdPercent: String(roundPercent(snapshot.partialPercent)),
    durationDays: String(days),
    durationHours: String(hours),
    durationMinutes: String(minutes),
    durationSeconds: String(seconds),
    fastPathVotes: String(snapshot.flat),
    quorum: String(snapshot.quorum),
  };
}

export function snapshotToHidden(snapshot: VotingSettingsSnapshot): HiddenVotingSettings {
  return {
    universalPercent: snapshot.universalPercent,
    graceDays: snapshot.graceDays,
    disableFastPathForNewMembers: snapshot.disableFastPathForNewMembers,
  };
}

export type ParseVotingSettingsResult =
  | { kind: 'ok'; value: VotingSettingsInput }
  | { kind: 'error'; message: string };

/**
 * Validate the form and produce a VotingSettingsInput, preserving the hidden fields.
 *
 * `editorCount` is passed at create time (the creator is the only initial editor, so
 * flat/quorum are checked against it). For edits the current editor count is unknown
 * client-side, so it's omitted and the contract enforces those bounds on execution —
 * exactly as the SDK's own validator documents.
 */
export function parseVotingSettingsForm(
  state: VotingSettingsFormState,
  hidden: HiddenVotingSettings,
  editorCount?: number
): ParseVotingSettingsResult {
  const durationFields = [state.durationDays, state.durationHours, state.durationMinutes, state.durationSeconds];
  const required = [state.slowPathThresholdPercent, state.fastPathVotes, state.quorum, ...durationFields];

  // Number('') and Number('  ') are 0, so blank fields must be rejected before conversion
  // or they silently become 0 (e.g. a 0% threshold or a 0-second duration).
  if (required.some(v => v.trim() === '')) {
    return { kind: 'error', message: 'All fields are required.' };
  }

  const partial = Number(state.slowPathThresholdPercent);
  const flat = Number(state.fastPathVotes);
  const quorum = Number(state.quorum);
  const days = Number(state.durationDays);
  const hours = Number(state.durationHours);
  const minutes = Number(state.durationMinutes);
  const seconds = Number(state.durationSeconds);

  if (![partial, flat, quorum, days, hours, minutes, seconds].every(Number.isFinite)) {
    return { kind: 'error', message: 'All fields must be valid numbers.' };
  }
  if (partial < 0 || partial > 100) {
    return { kind: 'error', message: 'Slow path threshold must be between 0 and 100%.' };
  }
  if (![days, hours, minutes, seconds].every(n => Number.isInteger(n) && n >= 0)) {
    return { kind: 'error', message: 'Vote duration values must be non-negative whole numbers.' };
  }
  if (!Number.isInteger(flat) || flat < 1) {
    return { kind: 'error', message: 'Fast path votes must be at least 1.' };
  }
  if (!Number.isInteger(quorum) || quorum < 1) {
    return { kind: 'error', message: 'Quorum must be at least 1.' };
  }

  const durationInSeconds = days * SECONDS_PER_DAY + hours * 3600 + minutes * 60 + seconds;
  if (durationInSeconds < 60) {
    return { kind: 'error', message: 'Vote duration must be at least 1 minute.' };
  }

  const value: VotingSettingsInput = {
    partialPercentageSupportThreshold: partial,
    universalPercentageSupportThreshold: hidden.universalPercent,
    flatSupportThreshold: flat,
    quorum,
    durationInSeconds,
    disableFastPathAccessForNewMembers: hidden.disableFastPathForNewMembers,
    executionGracePeriodInDays: hidden.graceDays,
  };

  const sdkError = validateVotingSettingsInput(value, editorCount);
  if (sdkError) {
    return { kind: 'error', message: sdkError };
  }

  return { kind: 'ok', value };
}

/** Non-blocking warnings for values that parse cleanly but are likely mistakes. */
export function votingSettingsWarnings(state: VotingSettingsFormState): string[] {
  const warnings: string[] = [];
  const partial = Number(state.slowPathThresholdPercent);

  if (Number.isFinite(partial) && partial > 0 && partial < 1) {
    warnings.push(
      `Slow path threshold is ${partial}%. Percentages are whole numbers — 50 means 50%, not 0.5. Did you mean ${Math.round(partial * 10)}%?`
    );
  }
  return warnings;
}
