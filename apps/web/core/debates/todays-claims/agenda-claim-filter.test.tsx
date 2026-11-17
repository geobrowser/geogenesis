import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENDA_FIXTURE_CLAIM as CLAIM, AGENDA_FIXTURE_SPACE as SPACE, agendaRow } from './debate-agenda-fixtures';

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  calls: 0,
  pending: false,
  fail: false,
}));

vi.mock('~/core/io/graphql-client', () => ({
  graphql: ({ decoder }: { decoder: (data: unknown) => unknown }) => {
    mocks.calls += 1;
    if (mocks.fail) return Effect.fail(new Error('down'));
    return mocks.pending ? Effect.never : Effect.succeed(decoder({ currentDebateAgendas: mocks.rows }));
  },
}));

// The filter never resolves claim entities (GEO-3775 review M2): if it did, this would throw.
vi.mock('../claim-picker-page', () => ({
  useClaimEntitiesByIds: () => {
    throw new Error('the agenda filter must not resolve claim entities');
  },
}));

const {
  AgendaClaimFilterContext,
  INACTIVE_AGENDA_FILTER,
  agendaMatches,
  hubCardScope,
  useAgendaClaimFilter,
  useAgendaClaimFilterContext,
} = await import('./agenda-claim-filter');

/** A surface as the panel builds one: the filter read above its tabs and provided to them. */
function AgendaSurface({ children }: { children: React.ReactNode }) {
  const filter = useAgendaClaimFilter(true);
  return <AgendaClaimFilterContext.Provider value={filter}>{children}</AgendaClaimFilterContext.Provider>;
}

const OTHER = 'c0000000000000000000000000000002';
const OFF_AGENDA = 'c0000000000000000000000000000009';

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mocks.rows = [
    agendaRow(),
    // Listed earlier in the week, in a second space, spelled as a UUID.
    agendaRow({
      entityId: 'c0000000-0000-0000-0000-000000000002',
      spaceId: '41e85161000000000000000000000000',
      isCurrent: false,
      agendaId: 'agenda-earlier',
      listedOn: '2026-10-26',
    }),
    // Ranking-only rows are not agenda contents.
    agendaRow({ source: 'agenda_debates', entityId: OFF_AGENDA }),
  ];
  mocks.calls = 0;
  mocks.pending = false;
  mocks.fail = false;
});

afterEach(() => cleanup());

describe('useAgendaClaimFilter', () => {
  it('lets everything through when off, and asks for nothing', () => {
    const { result } = renderHook(() => useAgendaClaimFilter(false), { wrapper: Wrapper });

    expect(result.current).toBe(INACTIVE_AGENDA_FILTER);
    expect(result.current.has(OFF_AGENDA)).toBe(true);
    expect(result.current.ids).toBeNull();
    expect(mocks.calls).toBe(0);
  });

  it('lists the agendas’ claims, sorted and normalised, and nothing ranking-only', async () => {
    const { result } = renderHook(() => useAgendaClaimFilter(true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(result.current.ids).toEqual([CLAIM, OTHER]);
    expect(result.current.spaceIds).toEqual(['41e85161000000000000000000000000', SPACE]);
    expect(result.current.has('c0000000-0000-0000-0000-000000000001')).toBe(true);
    expect(result.current.has(OFF_AGENDA)).toBe(false);
  });

  // Never "everything" while the answer is out: an off-agenda row drawn now would be taken back.
  it('admits nothing while the agendas are loading', () => {
    mocks.pending = true;
    const { result } = renderHook(() => useAgendaClaimFilter(true), { wrapper: Wrapper });

    expect(result.current.pending).toBe(true);
    expect(result.current.ids).toEqual([]);
    expect(result.current.has(CLAIM)).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('is an error, admitting nothing, when the agendas fail with none in hand', async () => {
    mocks.fail = true;
    const { result } = renderHook(() => useAgendaClaimFilter(true), { wrapper: Wrapper });
    // After the one retry the agendas query allows.
    await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 5000 });

    expect(result.current.pending).toBe(false);
    expect(result.current.has(CLAIM)).toBe(false);
    expect(result.current.ids).toEqual([]);

    mocks.fail = false;
    result.current.refetch();
    await waitFor(() => expect(result.current.has(CLAIM)).toBe(true));
    expect(result.current.error).toBeNull();
  });

  it('is empty, not an error, when the agendas list nothing', async () => {
    mocks.rows = [];
    const { result } = renderHook(() => useAgendaClaimFilter(true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(result.current.ids).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  // GEO-3495 attribution for cards on the panel's and hub's lists.
  it('credits a claim to the agenda that lists it', async () => {
    const { result } = renderHook(() => useAgendaClaimFilter(true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(result.current.scopeFor(CLAIM)).toEqual({
      agenda_id: 'agenda-today',
      agenda_date: '2026-10-28',
      list_section_id: 'block-1',
    });
    expect(result.current.scopeFor(OTHER)).toEqual({ agenda_id: 'agenda-earlier', agenda_date: '2026-10-26' });
    expect(result.current.scopeFor(OFF_AGENDA)).toBeUndefined();
  });
});

describe('AgendaClaimFilterContext', () => {
  it('hands one filter to everything under it, and the inactive one outside', async () => {
    const { result } = renderHook(() => useAgendaClaimFilterContext(), {
      wrapper: ({ children }) => (
        <Wrapper>
          <AgendaSurface>{children}</AgendaSurface>
        </Wrapper>
      ),
    });
    await waitFor(() => expect(result.current.has(CLAIM)).toBe(true));
    expect(mocks.calls).toBe(1);

    const outside = renderHook(() => useAgendaClaimFilterContext(), { wrapper: Wrapper });
    expect(outside.result.current).toBe(INACTIVE_AGENDA_FILTER);
  });

  // Review H1: the panel swaps tabs by unmounting one list before mounting the next. The agendas are
  // `gcTime: 0`, so they must be observed above the swap or the next tab asks gaia again.
  it('keeps one read across a swap of everything under it', async () => {
    const Reader = () => {
      const filter = useAgendaClaimFilterContext();
      return <span>{filter.has(CLAIM) ? 'listed' : 'waiting'}</span>;
    };
    const Surface = ({ tab }: { tab: 'a' | 'b' }) => (
      <AgendaSurface>{tab === 'a' ? <Reader key="a" /> : <Reader key="b" />}</AgendaSurface>
    );
    const view = render(
      <Wrapper>
        <Surface tab="a" />
      </Wrapper>
    );
    await waitFor(() => expect(view.getByText('listed')).toBeTruthy());

    view.rerender(
      <Wrapper>
        <Surface tab="b" />
      </Wrapper>
    );
    expect(view.getByText('listed')).toBeTruthy();
    expect(mocks.calls).toBe(1);
  });
});

describe('hubCardScope', () => {
  const filter = {
    ...INACTIVE_AGENDA_FILTER,
    active: true,
    scopeFor: (claimId: string) =>
      claimId === CLAIM ? { agenda_id: 'agenda-today', agenda_date: '2026-11-16' } : undefined,
  };

  it('adds the agenda that lists the claim, and the search beside it', () => {
    expect(hubCardScope(filter, CLAIM, false)).toEqual({ agenda_id: 'agenda-today', agenda_date: '2026-11-16' });
    expect(hubCardScope(filter, CLAIM, true)).toEqual({
      list_searched: true,
      agenda_id: 'agenda-today',
      agenda_date: '2026-11-16',
    });
  });

  it('is the search alone, or nothing, for a claim no agenda lists', () => {
    expect(hubCardScope(filter, OFF_AGENDA, true)).toEqual({ list_searched: true });
    expect(hubCardScope(filter, OFF_AGENDA, false)).toBeUndefined();
    expect(hubCardScope(INACTIVE_AGENDA_FILTER, CLAIM, false)).toBeUndefined();
  });
});

describe('agendaMatches', () => {
  const on = { claim: { claim_entity_id: CLAIM } };
  const off = { claim: { claim_entity_id: OFF_AGENDA } };

  it('keeps every match when inactive, and only the listed ones when active', () => {
    expect(agendaMatches(INACTIVE_AGENDA_FILTER, [on, off])).toEqual([on, off]);
    const listed = { ...INACTIVE_AGENDA_FILTER, active: true, has: (claimId: string) => claimId === CLAIM };
    expect(agendaMatches(listed, [on, off])).toEqual([on]);
  });
});
