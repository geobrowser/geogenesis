import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AGENDA_FIXTURE_CLAIM as CLAIM, AGENDA_FIXTURE_SPACE as WORLD, agendaRow } from './debate-agenda-fixtures';

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  calls: [] as Record<string, unknown>[],
  signals: [] as unknown[],
  pending: false,
  fail: false,
  /** Requests that fail before the agendas answer. */
  failTimes: 0,
  claims: { entities: [] as unknown[], isLoading: false },
}));

vi.mock('~/core/io/graphql-client', () => ({
  graphql: ({
    decoder,
    variables,
    signal,
  }: {
    decoder: (data: unknown) => unknown;
    variables: Record<string, unknown>;
    signal?: AbortSignal;
  }) => {
    mocks.calls.push(variables);
    mocks.signals.push(signal);
    if (mocks.fail) return Effect.fail(new Error('down'));
    if (mocks.failTimes > 0) {
      mocks.failTimes -= 1;
      return Effect.fail(new Error('statement timeout'));
    }
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

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** One client across mounts, for what a visit leaves behind for the next. */
function sharedClient() {
  const client = new QueryClient();
  const SharedWrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, SharedWrapper };
}

beforeEach(() => {
  mocks.rows = [agendaRow()];
  mocks.calls = [];
  mocks.signals = [];
  mocks.pending = false;
  mocks.fail = false;
  mocks.failTimes = 0;
  mocks.claims = { entities: [{ id: CLAIM, name: 'A claim' }], isLoading: false };
});

afterEach(() => {
  // Unmount every hook, so an earlier test's failed query doesn't answer this one's focus event.
  cleanup();
  vi.restoreAllMocks();
});

describe('fetchCurrentDebateAgendas', () => {
  // The API stops at 100 rows unless asked for more, and a week of earlier listings passes that.
  it('asks for this week’s agendas in one request, up to the API’s 1000-row maximum', async () => {
    const controller = new AbortController();
    expect(await fetchCurrentDebateAgendas(controller.signal)).toEqual([agendaRow()]);
    expect(mocks.calls).toEqual([{ earlierDays: 6, first: 1000 }]);
    expect(mocks.signals).toEqual([controller.signal]);
  });

  // gaia's columns are non-null; a row that breaks that is dropped rather than taking the tab down.
  it('drops null and incomplete rows, and reads a missing list as none', async () => {
    mocks.rows = [agendaRow(), null, { ...agendaRow(), entityId: null }, { ...agendaRow(), listedOn: undefined }];
    expect(await fetchCurrentDebateAgendas()).toEqual([agendaRow()]);

    mocks.rows = null as unknown as unknown[];
    expect(await fetchCurrentDebateAgendas()).toEqual([]);
  });

  it('says so when the agendas fill the row limit, rather than passing off a cut list as whole', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.rows = Array.from({ length: 1000 }, () => agendaRow());

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
    mocks.rows = [agendaRow(), agendaRow({ source: 'agenda_topics', entityId: 'topic-1', sectionId: null })];
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

    await waitFor(() => expect(result.current.error).toBeTruthy(), { timeout: 3000 });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.agendasIn(() => true).spaces).toEqual([]);
  });

  // `graphql` retries transport failures only; a GraphQL error such as a statement timeout gets one
  // retry here.
  it('retries a failed request once', async () => {
    mocks.failTimes = 1;
    const { result } = renderHook(() => useDebateAgendas(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.agendasIn(() => true).spaces).toHaveLength(1), { timeout: 3000 });
    expect(result.current.error).toBeNull();
    expect(mocks.calls).toHaveLength(2);
  });

  // The page has no retry button, so a failed load must not stay failed for the whole visit.
  it('tries a failed load again when the tab regains focus, and leaves loaded agendas alone', async () => {
    mocks.failTimes = 2;
    const { result } = renderHook(() => useDebateAgendas(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy(), { timeout: 3000 });

    const refocus = () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    };
    refocus();
    await waitFor(() => expect(result.current.agendasIn(() => true).spaces).toHaveLength(1));
    expect(mocks.calls).toHaveLength(3);

    refocus();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.calls).toHaveLength(3);
    focusManager.setFocused(undefined);
  });

  // The gateway refetches the whole `debates` root on every (re)connect. An open picker keeps the
  // agendas it opened on.
  it('is left alone when the gateway refetches debates', async () => {
    const { client, SharedWrapper } = sharedClient();
    const { result } = renderHook(() => useDebateAgendas(), { wrapper: SharedWrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await client.invalidateQueries({ predicate: query => query.queryKey[0] === 'debates', refetchType: 'active' });

    expect(mocks.calls).toHaveLength(1);
  });

  // The page's flag only turns on after hydration, so each visit mounts disabled and then enables.
  // A cached answer from the last visit must not stand in for this one.
  it('asks again on the next visit, even when it mounts disabled', async () => {
    const { SharedWrapper } = sharedClient();
    const first = renderHook(() => useDebateAgendas(), { wrapper: SharedWrapper });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();
    // Leaving the page and coming back takes longer than react-query's gcTime-0 timer.
    await new Promise(resolve => setTimeout(resolve, 0));

    const next = renderHook(({ enabled }) => useDebateAgendas(enabled), {
      wrapper: SharedWrapper,
      initialProps: { enabled: false },
    });
    next.rerender({ enabled: true });

    await waitFor(() => expect(mocks.calls).toHaveLength(2));
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
