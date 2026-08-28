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
}));

vi.mock('~/core/io/graphql-client', () => ({
  graphql: ({ decoder }: { decoder: (data: unknown) => unknown }) =>
    Effect.promise(async () => {
      const response = mocks.responses[mocks.calls++] ?? {};
      if (mocks.gate) await new Promise<void>(resolve => (mocks.gate = resolve));
      return decoder(response);
    }),
}));

vi.mock('~/core/claims/browse/claim-debates', () => ({ useWinnerShares: () => new Map() }));

const { usePersonRecords } = await import('./use-person-records');

function record(positions: number) {
  return {
    positions: { totalCount: positions },
    supported: { totalCount: 0, nodes: [] },
    opposed: { totalCount: 0, nodes: [] },
    joined: { createdAt: '1769726933' },
  };
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

  it('asks for nobody when the list is empty', () => {
    const { result } = renderHook(() => usePersonRecords([]), { wrapper });

    expect(result.current.size).toBe(0);
    expect(mocks.calls).toBe(0);
  });
});
