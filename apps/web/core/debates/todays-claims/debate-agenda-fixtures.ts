import type { DebateAgendaRow } from './debate-agendas';

export const AGENDA_FIXTURE_SPACE = '89bd89bf28ff8a0963faf92a8c905e20';
export const AGENDA_FIXTURE_CLAIM = 'c0000000000000000000000000000001';

/** Midnight New York on `day`, written the way gaia's `currentDebateAgendas` writes `listedAt`. */
export function agendaMidnight(day: string) {
  return `${day}T04:00:00+00:00`;
}

/** One `currentDebateAgendas` row: a claim in a current agenda's block, unless overridden. */
export function agendaRow(overrides: Partial<DebateAgendaRow> = {}): DebateAgendaRow {
  const listedOn = overrides.listedOn ?? '2026-10-28';
  return {
    spaceId: AGENDA_FIXTURE_SPACE,
    agendaId: 'agenda-today',
    listedOn,
    listedAt: agendaMidnight(listedOn),
    isCurrent: true,
    source: 'block_item',
    sectionId: 'block-1',
    sectionName: 'Brazil election',
    entityId: AGENDA_FIXTURE_CLAIM,
    ...overrides,
  };
}
