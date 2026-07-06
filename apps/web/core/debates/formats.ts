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
    label: '7/7 4/4',
    turnDurationsMs: [7_000, 7_000, 4_000, 4_000],
    developmentOnly: true,
  },
  {
    id: 'standard',
    label: '1/1 45/45',
    turnDurationsMs: [60_000, 60_000, 45_000, 45_000],
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
