import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_RESPONSE_OBJECT_TYPE } from '~/core/claims/browse/claim-response-summary';
import { resolveClaimResponseKind } from '~/core/claims/browse/use-claim-response-state';
import type { Debate } from '~/core/debates/api';
import type { ClaimTiming } from '~/core/debates/claim-timing';
import type { DebateTranscriptClaims } from '~/core/debates/transcript-claims';
import { entityResponseCountsQueryKey, userEntityResponseQueryKey } from '~/core/responses/entity-response';

import { useDebateEndCard } from './use-debate-end-card';

const DEBATE_SPACE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DEBATE_SPACE_HEX = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ELSEWHERE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const STEVE = 'cccccccccccccccccccccccccccccccc';
const JONATHAN = 'dddddddddddddddddddddddddddddddd';
const CLAIM_UUID = 'EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE';
const CLAIM_HEX = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const mocks = vi.hoisted(() => ({
  claims: null as unknown,
  transcriptLoading: false,
  transcriptError: null as unknown,
  batchCalls: [] as { spaceId: string; targets: { entityId: string }[]; enabled: boolean }[],
  claimSummary: null as unknown,
  /** The `enabled` each lookup of the debated claim's entity was made with. */
  entityEnabled: [] as boolean[],
  /** When each claim was said, and whether the timings have answered. */
  timings: new Map() as Map<string, unknown>,
  timingsReady: true,
  /** What the batch query reports: whether it has data yet, and whether it failed. */
  batchResult: {
    data: new Map() as unknown,
    isError: false,
    isStale: false,
    isFetching: false,
    refetch: (() => Promise.resolve()) as () => Promise<unknown>,
  },
  /** The entity each render handed the claim's own response state. */
  claimEntity: [] as unknown[],
  /** What each render asked the next-debate suggestion with. */
  nextDebateCalls: [] as { live: boolean }[],
}));

vi.mock('~/core/debates/use-debate-transcript-claims', () => ({
  useDebateTranscriptClaims: () => ({
    claims: mocks.claims,
    isLoading: mocks.transcriptLoading,
    error: mocks.transcriptError,
  }),
}));
// The batch is the fetcher and seeds the per-claim caches; here the test seeds them itself, so what
// is under test is the reading — including a cache a vote has refreshed since.
vi.mock('~/core/responses/use-claim-response-summaries', () => ({
  useClaimResponseSummaryBatch: (args: { spaceId: string; targets: { entityId: string }[]; enabled: boolean }) => {
    mocks.batchCalls.push(args);
    return mocks.batchResult;
  },
}));
vi.mock('~/core/debates/use-claim-timings', () => ({
  useClaimTimings: () => ({ timings: mocks.timings, isReady: mocks.timingsReady }),
}));
// Two lookups: the debated claim's own entity, and every extracted claim's for the carousel.
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: ({ where, enabled }: { where: { id: { in: string[] } }; enabled: boolean }) => {
    const ids = where.id.in;
    if (ids.length === 1 && ids[0] === 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      mocks.entityEnabled.push(enabled);
      return { entities: enabled ? [{ id: 'claim-entity' }] : [] };
    }
    return { entities: enabled ? ids.map(id => ({ id })) : [] };
  },
}));
vi.mock('./use-next-debate', () => ({
  useNextDebate: (_debate: unknown, live: boolean) => {
    mocks.nextDebateCalls.push({ live });
    return null;
  },
}));
vi.mock('./use-debate-claim-response', () => ({
  useDebateClaimResponse: ({ entity }: { entity: unknown }) => {
    mocks.claimEntity.push(entity);
    return { responseKind: 'stance', summary: mocks.claimSummary, control: {} };
  },
}));

/** A claim said in `author`'s turn; the block id is the turn, and names who said it. */
const claim = (id: string, spaceId: string | null, author = 'unknown') => ({
  id,
  text: `Claim ${id}`,
  spaceId,
  blockId: `block-${author}`,
});

/** What the batch query reports, answered and fresh unless a test says otherwise. */
const batch = (overrides: Partial<typeof mocks.batchResult>) => ({
  data: new Map() as unknown,
  isError: false,
  isStale: false,
  isFetching: false,
  refetch: () => Promise.resolve(),
  ...overrides,
});

function transcript(byAuthor: Record<string, ReturnType<typeof claim>[]>): DebateTranscriptClaims {
  const all = Object.values(byAuthor).flat();
  return {
    all,
    byAuthorSpaceId: new Map(Object.entries(byAuthor)),
    unattributed: [],
    blocks: Object.keys(byAuthor).map(author => ({ id: `block-${author}`, authorSpaceId: author, text: '' })),
    totalCount: all.length,
  } as unknown as DebateTranscriptClaims;
}

const saidAt = (startMs: number): ClaimTiming => ({
  startMs,
  endMs: startMs + 1000,
  confidence: 1,
  source: 'published',
});

let queryClient: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const render = <P,>(hook: (props: P) => ReturnType<typeof useDebateEndCard>, initialProps?: P) =>
  renderHook(hook, { wrapper, initialProps: initialProps as P });

const debate = {
  id: 'debate-1',
  claim: { space_id: DEBATE_SPACE, claim_entity_id: CLAIM_UUID, claim: 'The claim' },
  participants: [
    { participant_slot: 1, profile_space_id: STEVE, display_name: 'Steve', position: true },
    { participant_slot: 2, profile_space_id: JONATHAN, display_name: 'Jonathan', position: false },
  ],
} as unknown as Debate;

describe('useDebateEndCard', () => {
  beforeEach(() => {
    mocks.batchCalls = [];
    mocks.entityEnabled = [];
    mocks.claimEntity = [];
    mocks.batchResult = batch({ data: new Map() });
    mocks.claimSummary = { positive: 62, negative: 38, total: 100, percent: 62, meetsFloor: true };
    mocks.transcriptLoading = false;
    mocks.transcriptError = null;
    mocks.claims = transcript({
      [STEVE]: [
        claim('s1', DEBATE_SPACE_HEX, STEVE),
        claim('s2', DEBATE_SPACE_HEX, STEVE),
        claim('s3', ELSEWHERE, STEVE),
      ],
      [JONATHAN]: [claim('j1', DEBATE_SPACE_HEX, JONATHAN), claim('j2', null, JONATHAN)],
    });
    // Graph order is random; this is the order they were said in.
    mocks.timings = new Map([
      ['j1', saidAt(1_000)],
      ['s2', saidAt(2_000)],
      ['s3', saidAt(3_000)],
      ['s1', saidAt(4_000)],
    ]);
    mocks.timingsReady = true;
    queryClient = new QueryClient();
  });

  it('lays the extracted claims out in the order they were said, each with who said it', () => {
    const { result } = render(() => useDebateEndCard(debate, true));
    const { claims, speakerByClaimId } = result.current.carousel;

    // j2 has no space to answer in, so its card could never take a vote; it is left out.
    expect(claims.map(claim => claim.id)).toEqual(['j1', 's2', 's3', 's1']);
    expect(speakerByClaimId.get('j1')?.display_name).toBe('Jonathan');
    expect(speakerByClaimId.get('s3')?.display_name).toBe('Steve');
  });

  it('keeps a claim published in another space, which answers in its own space', () => {
    const { result } = render(() => useDebateEndCard(debate, true));
    expect(result.current.carousel.claims.find(claim => claim.id === 's3')?.spaceId).toBe(ELSEWHERE);
  });

  it('leaves out a claim nobody in the debate can be credited with', () => {
    mocks.claims = transcript({
      [STEVE]: [claim('s1', DEBATE_SPACE_HEX, STEVE)],
      stranger: [claim('x1', DEBATE_SPACE_HEX, 'stranger')],
    });
    const { result } = render(() => useDebateEndCard(debate, true));

    expect(result.current.carousel.claims.map(claim => claim.id)).toEqual(['s1']);
  });

  it('draws no carousel until the timings are in, rather than reshuffling it under the viewer', () => {
    mocks.timingsReady = false;
    const { result } = render(() => useDebateEndCard(debate, true));

    expect(result.current.carousel.claims).toEqual([]);
  });

  it('draws no carousel while the transcript is still loading', () => {
    mocks.transcriptLoading = true;
    mocks.claims = transcript({});
    const { result } = render(() => useDebateEndCard(debate, true));

    expect(result.current.carousel.claims).toEqual([]);
    expect(mocks.batchCalls.at(-1)?.enabled).toBe(false);
  });

  it("asks for every extracted claim in the debate's space in one batch, but not the debated claim", () => {
    // s3's votes live in its own space, and j2 has none; each card asks for itself there. The claim
    // being debated is read by the debate card's footer on the same keys (GEO-3454), so batching it
    // too would fetch it twice.
    render(() => useDebateEndCard(debate, true));
    const call = mocks.batchCalls.at(-1)!;

    expect(call.spaceId).toBe(DEBATE_SPACE_HEX);
    expect(call.targets.map(target => target.entityId)).toEqual(['s1', 's2', 'j1']);
    expect(call.targets.map(target => target.entityId)).not.toContain(CLAIM_HEX);
  });

  // With nothing in the debate's own space there is nothing to batch, and the batch never runs.
  // Waiting on it would hold a claim quoted from elsewhere back for good.
  it("releases the carousel's entities when no claim is in the debate's space", () => {
    mocks.claims = transcript({ [STEVE]: [claim('s3', ELSEWHERE, STEVE)] });
    mocks.batchResult = batch({ data: undefined });
    const { result } = render(() => useDebateEndCard(debate, true));

    expect(mocks.batchCalls.at(-1)?.targets).toEqual([]);
    expect(result.current.carousel.entitiesByClaimId.get('s3')).toEqual({ id: 's3' });
  });

  it("holds the cards' entities back until the batch has seeded their counts", () => {
    mocks.batchResult = batch({ data: undefined });
    const { result, rerender } = render(() => useDebateEndCard(debate, true));
    expect(result.current.carousel.entitiesByClaimId.size).toBe(0);

    mocks.batchResult = batch({ data: new Map() });
    rerender(undefined as never);
    expect(result.current.carousel.entitiesByClaimId.get('s1')).toEqual({ id: 's1' });
  });

  it('holds the next-debate lookup back until shortly before the debate ends, or the card shows', () => {
    vi.useFakeTimers();
    try {
      const timed = { ...debate, turn_durations_ms: [60_000, 60_000] };
      const { rerender } = render(
        ({ enabled, shown }: { enabled: boolean; shown: boolean }) => useDebateEndCard(timed, enabled, shown),
        { enabled: true, shown: false }
      );
      expect(mocks.nextDebateCalls.at(-1)).toEqual({ live: false });

      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(mocks.nextDebateCalls.at(-1)).toEqual({ live: false });

      act(() => {
        vi.advanceTimersByTime(20_000);
      });
      expect(mocks.nextDebateCalls.at(-1)).toEqual({ live: true });

      // Scrolled away with the card on screen: still live, so the suggestion doesn't vanish either.
      rerender({ enabled: false, shown: true });
      expect(mocks.nextDebateCalls.at(-1)).toEqual({ live: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('works out the next debate at once when the card shows before the clock is up', () => {
    const { rerender } = render(
      ({ enabled, shown }: { enabled: boolean; shown: boolean }) => useDebateEndCard(debate, enabled, shown),
      { enabled: true, shown: false }
    );
    expect(mocks.nextDebateCalls.at(-1)).toEqual({ live: false });
    rerender({ enabled: true, shown: true });
    expect(mocks.nextDebateCalls.at(-1)).toEqual({ live: true });
  });

  it('keeps asking once the debate has been active, so scrolling past it does not empty the card', () => {
    // Scrolling makes another debate the active one while this card is still on screen. Turning the
    // reads off then emptied the entity lookup — a disabled one answers with nothing — and the
    // card's numbers vanished and came back as the viewer scrolled.
    const { rerender } = render(({ enabled }: { enabled: boolean }) => useDebateEndCard(debate, enabled), {
      enabled: true,
    });
    mocks.batchCalls = [];
    mocks.entityEnabled = [];

    rerender({ enabled: false });

    expect(mocks.batchCalls.at(-1)?.enabled).toBe(true);
    expect(mocks.entityEnabled.at(-1)).toBe(true);
  });

  it('holds a different debate back until it too has been active', () => {
    const { rerender } = render(
      ({ current, enabled }: { current: Debate; enabled: boolean }) => useDebateEndCard(current, enabled),
      { current: debate, enabled: true }
    );
    const next = { ...debate, id: 'debate-2' } as Debate;

    rerender({ current: next, enabled: false });
    expect(mocks.batchCalls.at(-1)?.enabled).toBe(false);
  });

  // The batch no longer carries this claim, so there is nothing to wait for: the footer and this
  // control share the claim's reads, whichever asks first.
  it("hands the claim's own control its entity without waiting on the batch", () => {
    mocks.batchResult = batch({ data: undefined });
    render(() => useDebateEndCard(debate, true));
    expect(mocks.claimEntity.at(-1)).toEqual({ id: 'claim-entity' });
  });

  it('hands it over while the transcript is still loading, too', () => {
    mocks.transcriptLoading = true;
    mocks.claims = transcript({});
    mocks.batchResult = batch({ data: undefined });
    render(() => useDebateEndCard(debate, true));

    expect(mocks.claimEntity.at(-1)).toEqual({ id: 'claim-entity' });
  });

  // Copilot on #2982: the debated claim left the batch, and with it the batch's refresh, so its split
  // could show the numbers it was read at before playback. Its two reads are refreshed here instead.
  it("refreshes the debated claim's counts and the viewer's side when the card comes on screen", async () => {
    const kind = resolveClaimResponseKind();
    const countsKey = entityResponseCountsQueryKey(CLAIM_HEX, DEBATE_SPACE_HEX, CLAIM_RESPONSE_OBJECT_TYPE, kind);
    const viewerKey = userEntityResponseQueryKey(
      'viewer',
      CLAIM_HEX,
      DEBATE_SPACE_HEX,
      CLAIM_RESPONSE_OBJECT_TYPE,
      kind
    );
    const otherKey = entityResponseCountsQueryKey('other-claim', DEBATE_SPACE_HEX, CLAIM_RESPONSE_OBJECT_TYPE, kind);
    const fetched: string[] = [];
    const minutesAgo = Date.now() - 5 * 60_000;
    for (const key of [countsKey, viewerKey, otherKey]) queryClient.setQueryData(key, {}, { updatedAt: minutesAgo });

    // Stand in for the footer's reads: mounted, so the queries are active, and stale.
    const { rerender } = render(
      ({ shown }: { shown: boolean }) => {
        for (const key of [countsKey, viewerKey, otherKey]) {
          // eslint-disable-next-line react-hooks/rules-of-hooks -- a fixed list, the same every render
          useQuery({
            queryKey: key,
            queryFn: () => {
              fetched.push(String(key[0]) + ':' + String(key.includes('other-claim') ? 'other' : 'claim'));
              return {};
            },
            staleTime: 30_000,
            // Read before playback and mounted since; nothing has asked again on its own.
            refetchOnMount: false,
          });
        }
        return useDebateEndCard(debate, true, shown);
      },
      { shown: false }
    );
    expect(fetched).toEqual([]);

    rerender({ shown: true });
    await act(async () => {});

    expect(fetched).toContain('entity-response-counts:claim');
    expect(fetched).toContain('user-entity-response:claim');
    // Only the debated claim's: another claim's reads are the carousel's batch's business.
    expect(fetched).not.toContain('entity-response-counts:other');
  });

  it('refreshes numbers read minutes ago when the card comes on screen', () => {
    // They were read when the debate became active; a query does not refetch just for going stale.
    const refetch = vi.fn(() => Promise.resolve());
    mocks.batchResult = batch({ data: new Map(), isStale: true, refetch });
    const { rerender } = render(({ shown }: { shown: boolean }) => useDebateEndCard(debate, true, shown), {
      shown: false,
    });
    expect(refetch).not.toHaveBeenCalled();

    rerender({ shown: true });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('leaves fresh numbers, and a batch that has not answered, alone when the card comes on screen', () => {
    const refetch = vi.fn(() => Promise.resolve());

    mocks.batchResult = batch({ data: new Map(), isStale: false, refetch });
    render(() => useDebateEndCard(debate, true, true));

    mocks.batchResult = batch({ data: undefined, isStale: true, refetch });
    render(() => useDebateEndCard(debate, true, true));

    expect(refetch).not.toHaveBeenCalled();
  });

  it('asks for nothing while held back', () => {
    render(() => useDebateEndCard(debate, false));
    expect(mocks.batchCalls.at(-1)?.enabled).toBe(false);
  });
});
