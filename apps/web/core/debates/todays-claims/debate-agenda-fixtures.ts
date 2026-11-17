import type { AgendaClaimFilter } from './agenda-claim-filter';
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

/**
 * An active agenda filter (GEO-3775) admitting `ids`, for lists under test: pending or failed admits
 * nothing, as the real one does. Each admitted claim is credited to `agenda-<id>`.
 */
export function agendaFilterFixture({
  ids = [] as string[],
  pending = false,
  error = null as unknown,
  refetch = () => {},
} = {}): AgendaClaimFilter {
  const admitted = new Set(pending || error ? [] : ids);
  return {
    active: true,
    ids: [...admitted],
    spaceIds: [],
    key: pending ? 'pending' : error ? 'failed' : [...admitted].join(','),
    has: claimId => admitted.has(claimId),
    pending,
    error: pending ? null : error,
    refetch,
    scopeFor: claimId =>
      admitted.has(claimId) ? { agenda_id: `agenda-${claimId}`, agenda_date: '2026-11-17' } : undefined,
  };
}
