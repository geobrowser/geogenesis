import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BOUNTY_FILTERS,
  applyBountyFilters,
  buildBountiesHref,
  communitySectionFilters,
  groupBounties,
  parseBountyFilters,
  serializeBountyFilters,
  sortBounties,
} from './filters';
import { EASY_DIFFICULTY_ID, HARD_DIFFICULTY_ID, MEDIUM_DIFFICULTY_ID } from './ontology';
import { BOUNTY_STATUS_DONE_ID, BOUNTY_STATUS_IN_PROGRESS_ID } from './ontology';
import type { BoardBounty } from './types';

function bounty(overrides: Partial<BoardBounty> & { id: string }): BoardBounty {
  return {
    spaceId: 'space-a',
    spaceLabel: 'Space A',
    name: overrides.id,
    description: null,
    budget: null,
    difficulty: null,
    difficultyId: null,
    status: null,
    statusId: null,
    deadline: null,
    skills: [],
    maintainers: [],
    allocatedIds: [],
    interestedCount: 0,
    updatedAt: null,
    isFeatured: false,
    contributors: [],
    ...overrides,
  };
}

describe('parseBountyFilters / serializeBountyFilters', () => {
  it('parses an empty query to the defaults and serializes defaults to nothing', () => {
    expect(parseBountyFilters(new URLSearchParams())).toEqual(DEFAULT_BOUNTY_FILTERS);
    expect(serializeBountyFilters(DEFAULT_BOUNTY_FILTERS).toString()).toBe('');
    expect(buildBountiesHref('/bounties', DEFAULT_BOUNTY_FILTERS)).toBe('/bounties');
  });

  it('round-trips every field', () => {
    const filters = {
      spaceId: 'space-b',
      featuredOnly: true,
      statuses: ['done', 'cancelled'] as const,
      difficulty: 'hard' as const,
      skillId: 'skill-1',
      query: 'drugs',
      sort: 'payout-asc' as const,
      groupBy: 'space' as const,
    };
    const params = serializeBountyFilters(filters);
    expect(parseBountyFilters(params)).toEqual(filters);
    expect(buildBountiesHref('/bounties', filters)).toContain('space=space-b');
  });

  it('collapses the full status set to status=all and back', () => {
    const all = parseBountyFilters(new URLSearchParams('status=all'));
    expect(all.statuses).toHaveLength(6);
    expect(serializeBountyFilters(all).get('status')).toBe('all');
  });

  it('tolerates junk: unknown statuses/difficulty/sort fall back, "all" space means no space', () => {
    const parsed = parseBountyFilters({
      space: 'all',
      status: 'bogus,done',
      difficulty: 'impossible',
      sort: 'nope',
      groupBy: 'nope',
    });
    expect(parsed.spaceId).toBeNull();
    expect(parsed.statuses).toEqual(['done']);
    expect(parsed.difficulty).toBeNull();
    expect(parsed.sort).toBe(DEFAULT_BOUNTY_FILTERS.sort);
    expect(parsed.groupBy).toBe(DEFAULT_BOUNTY_FILTERS.groupBy);
    // All-junk status list falls back to the default set rather than an empty set.
    expect(parseBountyFilters({ status: 'bogus' }).statuses).toEqual(DEFAULT_BOUNTY_FILTERS.statuses);
  });

  it('accepts Next.js searchParams objects (string arrays take the first value)', () => {
    expect(parseBountyFilters({ q: ['first', 'second'] }).query).toBe('first');
  });
});

describe('applyBountyFilters', () => {
  const open = bounty({ id: 'open', statusId: BOUNTY_STATUS_IN_PROGRESS_ID, difficultyId: EASY_DIFFICULTY_ID });
  const backlog = bounty({ id: 'backlog', statusId: null, spaceId: 'space-b' });
  const done = bounty({ id: 'done', statusId: BOUNTY_STATUS_DONE_ID, skills: [{ id: 'skill-1', name: 'Curation' }] });

  it('shows only open statuses by default and treats missing status as Backlog', () => {
    expect(applyBountyFilters([open, backlog, done], DEFAULT_BOUNTY_FILTERS).map(b => b.id)).toEqual([
      'open',
      'backlog',
    ]);
  });

  it('filters by space, difficulty, skill, and text query', () => {
    const all = { ...DEFAULT_BOUNTY_FILTERS, statuses: ['backlog', 'in-progress', 'done'] as const };
    expect(applyBountyFilters([open, backlog, done], { ...all, spaceId: 'space-b' }).map(b => b.id)).toEqual([
      'backlog',
    ]);
    expect(applyBountyFilters([open, backlog, done], { ...all, difficulty: 'easy' }).map(b => b.id)).toEqual(['open']);
    expect(applyBountyFilters([open, backlog, done], { ...all, skillId: 'skill-1' }).map(b => b.id)).toEqual(['done']);
    expect(applyBountyFilters([open, backlog, done], { ...all, query: 'BACK' }).map(b => b.id)).toEqual(['backlog']);
  });
});

describe('sortBounties', () => {
  const a = bounty({ id: 'a', budget: 100, deadline: '2026-09-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' });
  const b = bounty({ id: 'b', budget: 500, deadline: '2026-08-15T00:00:00Z', updatedAt: '2026-08-10T00:00:00Z' });
  const c = bounty({ id: 'c', budget: null, deadline: null, updatedAt: null });

  it('sorts by payout both directions with nulls last', () => {
    expect(sortBounties([a, b, c], 'payout-desc').map(x => x.id)).toEqual(['b', 'a', 'c']);
    expect(sortBounties([a, b, c], 'payout-asc').map(x => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by nearest deadline and most recently updated, nulls last', () => {
    expect(sortBounties([a, b, c], 'deadline-asc').map(x => x.id)).toEqual(['b', 'a', 'c']);
    expect(sortBounties([a, b, c], 'updated-desc').map(x => x.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('groupBounties', () => {
  const easy = bounty({ id: 'easy', difficultyId: EASY_DIFFICULTY_ID, difficulty: 'Easy' });
  const hard = bounty({
    id: 'hard',
    difficultyId: HARD_DIFFICULTY_ID,
    difficulty: 'Hard',
    spaceId: 'space-b',
    spaceLabel: 'B',
  });
  const medium = bounty({ id: 'medium', difficultyId: MEDIUM_DIFFICULTY_ID, difficulty: 'Medium' });
  const none = bounty({ id: 'none' });

  it('returns a single group when not grouping', () => {
    expect(groupBounties([easy, hard], 'none')).toHaveLength(1);
  });

  it('groups by difficulty in easy→hard order with unspecified last', () => {
    expect(groupBounties([none, hard, easy, medium], 'difficulty').map(g => g.key)).toEqual([
      'easy',
      'medium',
      'hard',
      'unspecified',
    ]);
  });

  it('groups by space following the participating-space order', () => {
    expect(groupBounties([easy, hard], 'space', ['space-b', 'space-a']).map(g => g.key)).toEqual([
      'space-b',
      'space-a',
    ]);
  });
});

describe('community section filters', () => {
  it('maps each section to its workflow statuses and carries the section controls into the URL', () => {
    const filters = communitySectionFilters('available', {
      featuredOnly: true,
      difficulty: 'hard',
      skillId: 'skill-1',
    });
    expect(filters.statuses).toEqual(['todo']);
    expect(buildBountiesHref('/space/s/bounties', filters)).toBe(
      '/space/s/bounties?scope=featured&status=todo&difficulty=hard&skill=skill-1'
    );
    expect(communitySectionFilters('completed').statuses).toEqual(['done']);
    expect(communitySectionFilters('in-progress').statuses).toEqual(['in-progress']);
    // And it parses back to the same filters.
    expect(parseBountyFilters(serializeBountyFilters(filters))).toEqual(filters);
  });

  it('featuredOnly keeps only featured bounties', () => {
    const featured = bounty({ id: 'f', isFeatured: true });
    const plain = bounty({ id: 'p' });
    expect(
      applyBountyFilters([featured, plain], { ...DEFAULT_BOUNTY_FILTERS, featuredOnly: true }).map(b => b.id)
    ).toEqual(['f']);
  });
});
