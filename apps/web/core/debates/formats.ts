'use client';

export type DebateFormatId = 'dev-short' | 'standard' | 'extended-standard' | 'triple-standard';

export type DebateFormat = {
  id: DebateFormatId;
  label: string;
  turnDurationsMs: number[];
  developmentOnly?: boolean;
};

export const debateFormats: DebateFormat[] = [
  {
    id: 'dev-short',
    label: '7/7 4/4 3/3',
    turnDurationsMs: [7_000, 7_000, 4_000, 4_000, 3_000, 3_000],
    developmentOnly: true,
  },
  {
    id: 'standard',
    label: '1/1 45/45 30/30',
    turnDurationsMs: [60_000, 60_000, 45_000, 45_000, 30_000, 30_000],
  },
  {
    id: 'extended-standard',
    label: '45/45 30/30',
    turnDurationsMs: [45_000, 45_000, 30_000, 30_000],
  },
  {
    id: 'triple-standard',
    label: '45/45 30/30 30/30',
    turnDurationsMs: [45_000, 45_000, 30_000, 30_000, 30_000, 30_000],
  },
];

export const defaultDebateFormatId: DebateFormatId = process.env.NODE_ENV === 'production' ? 'standard' : 'dev-short';

export function debateFormatById(id: string | null | undefined): DebateFormat | null {
  return debateFormats.find(format => format.id === id) ?? null;
}

export function isDebateFormatId(id: string | null | undefined): id is DebateFormatId {
  return debateFormatById(id) !== null;
}

export type DebateTurnRole = 'opening' | 'response' | 'rebuttal' | 'closing';

/**
 * What a turn *is*, from its position in the format (GEO-2852).
 *
 * Derived from the turn count rather than the format id, because everything downstream of a
 * started debate reads `turn_durations_ms` off the debate row and never sees the id again — a
 * debate recorded under the old four-turn `standard` still has to label its turns correctly.
 *
 * Two rounds keep their existing reading: open, then rebut. A third round makes the middle one the
 * rebuttal and hands the last one to closing arguments, which is the round GEO-2852 added.
 */
export function debateTurnRole(turnIndex: number, turnCount: number): DebateTurnRole {
  const roundCount = Math.ceil(turnCount / 2);
  const roundIndex = Math.floor(turnIndex / 2);
  if (roundIndex <= 0) return 'opening';
  if (roundIndex >= roundCount - 1) return roundCount >= 3 ? 'closing' : 'rebuttal';
  if (roundIndex === roundCount - 2) return 'rebuttal';
  return 'response';
}

export function debateRoundSummaries(format: DebateFormat) {
  const rounds: string[] = [];
  for (let index = 0; index < format.turnDurationsMs.length; index += 2) {
    const first = formatTurnDuration(format.turnDurationsMs[index] ?? 0);
    const second = formatTurnDuration(format.turnDurationsMs[index + 1] ?? 0);
    rounds.push(`${first} / ${second}`);
  }
  return rounds;
}

export function debateTimingSummary(format: DebateFormat) {
  return debateRoundSummaries(format).join(' · ');
}

function formatTurnDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1_000));
  if (seconds > 0 && seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}
