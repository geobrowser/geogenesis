import { afterEach, describe, expect, it, vi } from 'vitest';

import { writeRankingFilters } from '~/core/blocks/ranking/best-debates-ranking-filters';

import { replaceSearchParams, writeTeamViewParam } from './use-best-debates-ranking-filters';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('the ranking screen URL (GEO-3774)', () => {
  it('rewrites the query in place, keeping the path, the other params and the entry’s state', () => {
    window.history.replaceState({ guard: 'sentinel' }, '', '/space/s/e?blockId=b&team=to-rank#top');
    replaceSearchParams(params =>
      writeRankingFilters(params, { recorded: { kind: 'day', dayKey: '2026-10-02' }, debaterIds: [A], claimId: null })
    );
    expect(window.location.pathname).toBe('/space/s/e');
    expect(window.location.hash).toBe('#top');
    expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual({
      blockId: 'b',
      team: 'to-rank',
      recorded: '2026-10-02',
      debaters: A,
    });
    expect(window.history.state).toEqual({ guard: 'sentinel' });
  });

  it('keeps ?team=to-rank in step with the list on show', () => {
    window.history.replaceState(null, '', '/x?recorded=week');
    writeTeamViewParam(true);
    expect(window.location.search).toBe('?recorded=week&team=to-rank');
    writeTeamViewParam(false);
    expect(window.location.search).toBe('?recorded=week');
  });

  it('is a write Next syncs its router from, not one it takes for its own', () => {
    // Next's app router keeps `__NA` (and its tree) on every entry, and its patched `replaceState`
    // skips the router sync for a state carrying `__NA` or `_N` (next/dist/client/components/app-router.js).
    window.history.replaceState(
      { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: 'tree', rankingLeaveGuard: true },
      '',
      '/space/s/e?team=to-rank'
    );
    const replace = vi.spyOn(window.history, 'replaceState');
    replaceSearchParams(params =>
      writeRankingFilters(params, { recorded: { kind: 'week' }, debaterIds: [], claimId: null })
    );
    const [state, , url] = replace.mock.calls[0];
    const nextSkipsSync = Boolean(
      (state as { __NA?: unknown; _N?: unknown } | null)?.__NA || (state as { _N?: unknown } | null)?._N
    );
    expect(nextSkipsSync).toBe(false);
    expect(state).toMatchObject({ rankingLeaveGuard: true });
    expect(url).toBe('/space/s/e?team=to-rank&recorded=week');
  });
});
