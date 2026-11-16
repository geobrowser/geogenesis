import { afterEach, describe, expect, it } from 'vitest';

import { writeRankingFilters } from '~/core/blocks/ranking/best-debates-ranking-filters';

import { replaceSearchParams, writeTeamViewParam } from './use-best-debates-ranking-filters';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

afterEach(() => window.history.replaceState(null, '', '/'));

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
});
