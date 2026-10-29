import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateAgendaRow } from './debate-agendas';

const WORLD = '89bd89bf28ff8a0963faf92a8c905e20';
const CLAIM = 'c0000000000000000000000000000001';

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  calls: [] as Record<string, unknown>[],
  pending: false,
  fail: false,
  claims: { entities: [] as unknown[], isLoading: false },
}));

vi.mock('~/core/io/graphql-client', () => ({
  graphql: ({ decoder, variables }: { decoder: (data: unknown) => unknown; variables: Record<string, unknown> }) => {
    mocks.calls.push(variables);
    if (mocks.fail) return Effect.fail(new Error('down'));
    return mocks.pending ? Effect.never : Effect.succeed(decoder({ currentDebateAgendas: mocks.rows }));
  },
}));

vi.mock('../claim-picker-page', () => ({
  useClaimEntitiesByIds: (ids: string[]) => ({
    entities: ids.length > 0 ? mocks.claims.entities : [],
    isLoading: ids.length > 0 && mocks.claims.isLoading,
    error: null,
  }),
}));

const { fetchCurrentDebateAgendas, useDebateAgendas } = await import('./debate-agendas');

function row(overrides: Partial<DebateAgendaRow> = {}): DebateAgendaRow {
  return {
    spaceId: WORLD,
    agendaId: 'agenda-today',
    listedOn: '2026-10-28',
    listedAt: '2026-10-28T04:00:00+00:00',
    isCurrent: true,
    source: 'block_item',
    sectionId: 'block-1',
    sectionName: 'Brazil election',
    entityId: CLAIM,
    ...overrides,
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mocks.rows = [row()];
  mocks.calls = [];
  mocks.pending = false;
  mocks.fail = false;
  mocks.claims = { entities: [{ id: CLAIM, name: 'A claim' }], isLoading: false };
});

afterEach(() => vi.restoreAllMocks());

describe('fetchCurrentDebateAgendas', () => {
  // The API stops at 100 rows unless asked for more, and a week of earlier listings passes that.
  it('asks for this week’s agendas in one request, up to the API’s 1000-row maximum', async () => {
    expect(await fetchCurrentDebateAgendas()).toEqual([row()]);
    expect(mocks.calls).toEqual([{ earlierDays: 6, first: 1000 }]);
  });

  it('says so when the agendas fill the row limit, rather than passing off a cut list as whole', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.rows = Array.from({ length: 1000 }, () => row());

    await fetchCurrentDebateAgendas();

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('row limit'), expect.anything());
  });
});

describe('useDebateAgendas', () => {
  // Empty agendas mean "none" only once both have answered; the picker's landing waits on this.
  it.each([
    ['the agendas', () => (mocks.pending = true)],
    ['the claims they list', () => (mocks.claims.isLoading = true)],
  ])('reports loading while %s are still on their way', async (_what, pending) => {
    pending();
    const { result } = renderHook(() => useDebateAgendas(), { wrapper: Wrapper });
    await waitFor(() => expect(mocks.calls).toHaveLength(1));
    expect(result.current.isLoading).toBe(true);
  });

  it('lists the current agenda’s claims once the agendas and claims have answered', async () => {
    mocks.rows = [row(), row({ source: 'agenda_topics', entityId: 'topic-1', sectionId: null })];
    const { result } = renderHook(() => useDebateAgendas(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.spaceIds).toEqual([WORLD]);
    expect(result.current.claimIds).toEqual([CLAIM]);
    const agendas = result.current.agendasIn(() => true);
    expect(agendas.spaces[0]!.sections.map(section => [section.name, section.claimIds])).toEqual([
      ['Brazil election', [CLAIM]],
    ]);
    expect(result.current.agendasIn(() => false).spaces).toEqual([]);
  });

  // The picker shows its "couldn't load" state off this; there is no second way to read agendas.
  it('reports a failed request as an error, not as loading or as no agendas', async () => {
    mocks.fail = true;
    const { result } = renderHook(() => useDebateAgendas(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.agendasIn(() => true).spaces).toEqual([]);
  });

  it('asks for nothing with the flag off', () => {
    const { result } = renderHook(() => useDebateAgendas(false), { wrapper: Wrapper });

    expect(mocks.calls).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.spaceIds).toEqual([]);
    expect(result.current.claimIds).toEqual([]);
    expect(result.current.agendasIn(() => true).spaces).toEqual([]);
  });
});
