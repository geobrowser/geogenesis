import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BOUNTY_FILTERS,
  applyBountyFilters,
  bountyFacetCounts,
  buildBountiesHref,
  communitySectionFilters,
  countFacetOptions,
  groupBounties,
  parseBountyFilters,
  serializeBountyFilters,
  sortBounties,
} from './filters';
import { EASY_DIFFICULTY_ID, HARD_DIFFICULTY_ID, MEDIUM_DIFFICULTY_ID } from './ontology';
import { BOUNTY_STATUS_DONE_ID, BOUNTY_STATUS_IN_PROGRESS_ID, BOUNTY_STATUS_TODO_ID } from './ontology';
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
      difficulties: ['hard'] as const,
      skillIds: ['skill-1', 'skill-2'],
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
    expect(parsed.difficulties).toEqual([]);
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
    expect(applyBountyFilters([open, backlog, done], { ...all, difficulties: ['easy'] }).map(b => b.id)).toEqual([
      'open',
    ]);
    expect(applyBountyFilters([open, backlog, done], { ...all, skillIds: ['skill-1'] }).map(b => b.id)).toEqual([
      'done',
    ]);
    // Multi-select is an OR within the facet.
    expect(
      applyBountyFilters([open, backlog, done], { ...all, difficulties: ['easy', 'hard'] }).map(b => b.id)
    ).toEqual(['open']);
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
      difficulties: ['hard', 'easy'],
      skillIds: ['skill-1'],
    });
    expect(filters.statuses).toEqual(['todo']);
    expect(buildBountiesHref('/space/s/bounties', filters)).toBe(
      '/space/s/bounties?scope=featured&status=todo&difficulty=hard%2Ceasy&skill=skill-1'
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

describe('facet counts', () => {
  it('countFacetOptions counts each option against the other filters and sorts by count then label', () => {
    const items = [
      { kind: 'a', ok: true },
      { kind: 'b', ok: true },
      { kind: 'b', ok: true },
      { kind: 'b', ok: false },
      { kind: 'c', ok: true },
    ];
    const counted = countFacetOptions(
      items,
      [
        { key: 'a', label: 'Alpha' },
        { key: 'b', label: 'Beta' },
        { key: 'c', label: 'Gamma' },
        { key: 'd', label: 'Delta' },
      ],
      item => item.ok,
      (item, key) => item.kind === key
    );
    expect(counted).toEqual([
      { key: 'b', label: 'Beta', count: 2 },
      { key: 'a', label: 'Alpha', count: 1 },
      { key: 'c', label: 'Gamma', count: 1 },
      { key: 'd', label: 'Delta', count: 0 },
    ]);
  });

  it("bountyFacetCounts ignores the facet's own selection but honours every other filter", () => {
    const easyTodo = bounty({ id: 'e', difficultyId: EASY_DIFFICULTY_ID, statusId: BOUNTY_STATUS_TODO_ID });
    const hardTodo = bounty({
      id: 'h',
      difficultyId: HARD_DIFFICULTY_ID,
      statusId: BOUNTY_STATUS_TODO_ID,
      skills: [{ id: 's1', name: 'Writing' }],
    });
    const hardDone = bounty({ id: 'hd', difficultyId: HARD_DIFFICULTY_ID, statusId: BOUNTY_STATUS_DONE_ID });
    const all = [easyTodo, hardTodo, hardDone];

    // Difficulty counts with the default (open) status filter: the Done bounty is excluded, and the
    // current difficulty selection (hard) does not shrink the Easy count.
    const difficulty = bountyFacetCounts(all, { ...DEFAULT_BOUNTY_FILTERS, difficulties: ['hard'] }, 'difficulty');
    expect(difficulty.map(o => [o.key, o.count])).toEqual([
      ['easy', 1],
      ['hard', 1],
      ['medium', 0],
    ]);

    // Status counts ignore the status selection entirely (so Done shows its real count) but honour difficulty.
    const status = bountyFacetCounts(all, { ...DEFAULT_BOUNTY_FILTERS, difficulties: ['hard'] }, 'status');
    expect(status.find(o => o.key === 'todo')?.count).toBe(1);
    expect(status.find(o => o.key === 'done')?.count).toBe(1);
    expect(status.find(o => o.key === 'backlog')?.count).toBe(0);

    // Skill universe comes from the caller; a skill only present on the excluded Done bounty counts 0.
    const skill = bountyFacetCounts(all, DEFAULT_BOUNTY_FILTERS, 'skill', {
      skills: [
        { id: 's1', name: 'Writing' },
        { id: 's9', name: 'Zzz' },
      ],
    });
    expect(skill.map(o => [o.key, o.count])).toEqual([
      ['s1', 1],
      ['s9', 0],
    ]);
  });
});
