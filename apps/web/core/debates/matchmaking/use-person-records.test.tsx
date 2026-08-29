import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const A = '07842862d2c3654c0324a07bc7cce1a4';
const B = 'a379046c74a140178e1c0545c72767c5';

const mocks = vi.hoisted(() => ({
  /** Resolves the next response, so the "still loading" window can be held open. */
  gate: null as null | (() => void),
  responses: [] as Array<Record<string, unknown>>,
  calls: 0,
  shares: new Map<string, unknown>(),
  sharesAreStale: false,
}));

vi.mock('~/core/io/graphql-client', () => ({
  graphql: ({ decoder }: { decoder: (data: unknown) => unknown }) =>
    Effect.promise(async () => {
      const response = mocks.responses[mocks.calls++] ?? {};
      if (mocks.gate) await new Promise<void>(resolve => (mocks.gate = resolve));
      return decoder(response);
    }),
}));

vi.mock('~/core/claims/browse/claim-debates', () => ({
  useWinnerSharesWithStatus: () => ({ shares: mocks.shares, isStale: mocks.sharesAreStale }),
}));

const { usePersonRecords } = await import('./use-person-records');

function record(positions: number) {
  return {
    positions: { totalCount: positions },
    supported: { totalCount: 0, nodes: [] },
    opposed: { totalCount: 0, nodes: [] },
    joined: { createdAt: '1769726933' },
  };
}

/** A response where each person supports the debates given for them. */
function debated(...people: string[][]) {
  const out: Record<string, unknown> = {};
  people.forEach((debateIds, index) => {
    out[`p${index}_positions`] = { totalCount: 1 };
    out[`p${index}_supported`] = { totalCount: debateIds.length, nodes: debateIds.map(id => ({ fromEntityId: id })) };
    out[`p${index}_opposed`] = { totalCount: 0, nodes: [] };
    out[`p${index}_joined`] = { createdAt: '1769726933' };
  });
  return out;
}

/** The aliased response shape, for however many people are listed. */
function response(...people: number[]) {
  const out: Record<string, unknown> = {};
  people.forEach((positions, index) => {
    const r = record(positions);
    out[`p${index}_positions`] = r.positions;
    out[`p${index}_supported`] = r.supported;
    out[`p${index}_opposed`] = r.opposed;
    out[`p${index}_joined`] = r.joined;
  });
  return out;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mocks.gate = null;
  mocks.calls = 0;
  mocks.responses = [];
  mocks.shares = new Map();
  mocks.sharesAreStale = false;
});

afterEach(() => vi.clearAllMocks());

describe('usePersonRecords', () => {
  // The query key is the whole list, so somebody coming online makes it a different query. Without
  // keeping the previous answer, every row's stats blank out and return while the new batch loads —
  // including rows whose record was already in hand and had not changed.
  it('keeps the records it already has while a newly listed person loads', async () => {
    // Ids sort to [A, B]: A is p0 in both batches.
    mocks.responses = [response(16), response(16, 8)];

    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => usePersonRecords(ids), {
      wrapper,
      initialProps: { ids: [A] },
    });

    await waitFor(() => expect(result.current.get(A)?.positions).toBe(16));

    // Hold the second batch open, so this is the window the flicker happened in.
    mocks.gate = () => {};
    rerender({ ids: [A, B] });

    expect(result.current.get(A)?.positions).toBe(16);
    expect(result.current.get(B)).toBeUndefined();

    mocks.gate?.();
    await waitFor(() => expect(result.current.get(B)?.positions).toBe(8));
    expect(result.current.get(A)?.positions).toBe(16);
  });

  // The shares are retained across a key change so a rate does not blink out, which means that in
  // the window after a new person's record arrives they describe the *previous* set of debates.
  // Deriving a rate from that overlap would show a real number computed from part of the evidence.
  it('does not derive a rate from shares that describe the previous set of debates', async () => {
    // B debated A (d1) and somebody else (d2). The retained shares cover only d1 — the debate B
    // lost — so a rate derived now would read 0% while d2, which B may well have won, is unjudged.
    mocks.responses = [debated(['d1']), debated(['d1'], ['d1', 'd2'])];
    mocks.shares = new Map([['d1', { spaceId: A, percent: 100, totalVotes: 2, tied: false }]]);

    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => usePersonRecords(ids), {
      wrapper,
      initialProps: { ids: [A] },
    });

    await waitFor(() => expect(result.current.get(A)?.winRate).toEqual({ percent: 100, wins: 1, of: 1 }));

    // B arrives; the shares still cover only d1, so B's d2 is unjudged as far as they know.
    mocks.sharesAreStale = true;
    rerender({ ids: [A, B] });
    await waitFor(() => expect(result.current.get(B)).toBeDefined());

    // B gets counts but no rate, rather than a rate computed off A's debate.
    expect(result.current.get(B)?.debatesArgued).toBe(2);
    expect(result.current.get(B)?.winRate).toBeNull();
    // And A keeps the rate already derived from a settled set, so nothing blinks.
    expect(result.current.get(A)?.winRate).toEqual({ percent: 100, wins: 1, of: 1 });
  });

  // A carried rate describes the debates it was computed over. If a refetch turns up a debate that
  // rate never saw, carrying it pairs "2 debates" with "won 1 of 1" — a row disagreeing with itself.
  it('drops a carried rate once the debates it was computed over have changed', async () => {
    mocks.responses = [debated(['d1']), debated(['d1', 'd2'], ['d3'])];
    mocks.shares = new Map([['d1', { spaceId: A, percent: 100, totalVotes: 2, tied: false }]]);

    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => usePersonRecords(ids), {
      wrapper,
      initialProps: { ids: [A] },
    });

    await waitFor(() => expect(result.current.get(A)?.winRate).toEqual({ percent: 100, wins: 1, of: 1 }));

    mocks.sharesAreStale = true;
    rerender({ ids: [A, B] });
    await waitFor(() => expect(result.current.get(A)?.debatesArgued).toBe(2));

    // The count moved on, so the rate that described one debate is withheld rather than shown
    // beside a total it does not match.
    expect(result.current.get(A)?.winRate).toBeNull();
  });

  it('asks for nobody when the list is empty', () => {
    const { result } = renderHook(() => usePersonRecords([]), { wrapper });

    expect(result.current.size).toBe(0);
    expect(mocks.calls).toBe(0);
  });
});
