import { describe, expect, it } from 'vitest';

import {
  type TeamFilterDisplay,
  filterTeamIds,
  groupBySpace,
  orderMatchingDebates,
  teamTopicFacetEntityFilter,
  toRankTopicCounts,
  topicOptions,
} from './best-debates-team-filters';

const politics = { id: 'sp-pol', name: 'US Politics', image: null };
const dating = { id: 'sp-rel', name: 'Relationships', image: null };
const econ = { id: 'tecon', name: 'Economy' };
const law = { id: 'tlaw', name: 'Law' };
const love = { id: 'tlove', name: 'Dating' };

const displays: Record<string, TeamFilterDisplay> = {
  a: { title: 'Democrats are better for the economy', space: politics, topics: [econ] },
  b: { title: 'The death penalty should be abolished', space: politics, topics: [law] },
  c: { title: 'Dating apps should require ID verification', space: dating, topics: [love, law] },
  d: { title: 'Tariffs hurt the economy', space: politics, topics: [econ] },
};
const displayOf = (id: string) => displays[id];

describe('filterTeamIds', () => {
  it('searches titles and spaces, word by word, keeping the order', () => {
    expect(filterTeamIds(['a', 'b', 'c', 'd'], displayOf, { query: 'economy', topicIds: [] })).toEqual(['a', 'd']);
    expect(filterTeamIds(['a', 'b', 'c', 'd'], displayOf, { query: 'relationships id', topicIds: [] })).toEqual(['c']);
  });

  it('keeps a debate carrying every picked topic, and combines with search', () => {
    expect(filterTeamIds(['a', 'b', 'c', 'd'], displayOf, { query: '', topicIds: ['tlaw'] })).toEqual(['b', 'c']);
    expect(filterTeamIds(['a', 'b', 'c', 'd'], displayOf, { query: '', topicIds: ['tlaw', 'tlove'] })).toEqual(['c']);
    expect(filterTeamIds(['a', 'b', 'c', 'd'], displayOf, { query: '', topicIds: ['tlaw', 'tecon'] })).toEqual([]);
    expect(filterTeamIds(['a', 'b', 'c', 'd'], displayOf, { query: 'dating', topicIds: ['tlaw'] })).toEqual(['c']);
  });

  it('matches the fallback name of a debate whose display has not loaded', () => {
    expect(
      filterTeamIds(
        ['x'],
        () => undefined,
        { query: 'nuclear', topicIds: [] },
        () => 'Trump should rule out a nuclear strike'
      )
    ).toEqual(['x']);
    // An unloaded debate can't carry a topic, so a topic filter leaves it out.
    expect(filterTeamIds(['x'], () => undefined, { query: '', topicIds: ['tlaw'] })).toEqual([]);
  });
});

describe('topicOptions', () => {
  it('lists the topics in the list with counts, most used first', () => {
    expect(topicOptions(['a', 'b', 'c', 'd'], displayOf)).toEqual([
      { id: 'tecon', name: 'Economy', count: 2 },
      { id: 'tlaw', name: 'Law', count: 2 },
      { id: 'tlove', name: 'Dating', count: 1 },
    ]);
    expect(topicOptions(['c'], displayOf).map(option => option.id)).toEqual(['tlove', 'tlaw']);
  });
});

describe('groupBySpace', () => {
  it('groups in order of first appearance, keeps team order inside, and puts unknown spaces last', () => {
    const groups = groupBySpace(['c', 'a', 'x', 'b', 'd'], id => displays[id]);
    expect(groups.map(group => [group.space?.name ?? null, group.ids])).toEqual([
      ['Relationships', ['c']],
      ['US Politics', ['a', 'b', 'd']],
      [null, ['x']],
    ]);
  });

  it('has no groups for an empty list', () => {
    expect(groupBySpace([], displayOf)).toEqual([]);
  });
});

describe('toRankTopicCounts', () => {
  it('counts the whole To rank set, not the rows drawn, narrowed by search and picked topics', () => {
    const all = ['a', 'b', 'c', 'd'];
    // The same answer whichever slice of the list happens to be on screen: it never sees one.
    expect(toRankTopicCounts(all, displayOf, { query: '', topicIds: [] })).toEqual(topicOptions(all, displayOf));
    expect(toRankTopicCounts(all, displayOf, { query: '', topicIds: ['tlaw'] })).toEqual([
      { id: 'tlaw', name: 'Law', count: 2 },
      { id: 'tlove', name: 'Dating', count: 1 },
    ]);
    expect(toRankTopicCounts(all, displayOf, { query: 'economy', topicIds: [] })).toEqual([
      { id: 'tecon', name: 'Economy', count: 2 },
    ]);
  });

  it('is pending, not partial, while any debate in the set is still loading', () => {
    expect(toRankTopicCounts(['a', 'x'], id => displays[id], { query: '', topicIds: [] })).toBeNull();
  });
});

describe('teamTopicFacetEntityFilter', () => {
  it('counts every Debate, narrowed by each search word and each picked topic', () => {
    expect(
      teamTopicFacetEntityFilter({
        debateTypeId: 'deb',
        typesPropertyId: 'types',
        topicsPropertyId: 'top',
        query: ' tariff  power ',
        topicIds: ['t1'],
      })
    ).toEqual({
      and: [
        { relations: { some: { typeId: { is: 'types' }, toEntityId: { is: 'deb' } } } },
        { name: { includesInsensitive: 'tariff' } },
        { name: { includesInsensitive: 'power' } },
        { relations: { some: { typeId: { is: 'top' }, toEntityId: { is: 't1' } } } },
      ],
    });
  });
});

describe('orderMatchingDebates', () => {
  it('puts team places first in place order, then the unplaced newest first', () => {
    const rank: Record<string, number> = { b: 2, d: 1 };
    expect(
      orderMatchingDebates(
        [
          { entityId: 'a', createdAtMs: 1 },
          { entityId: 'b', createdAtMs: 2 },
          { entityId: 'c', createdAtMs: 3 },
          { entityId: 'd', createdAtMs: 4 },
        ],
        id => rank[id]
      )
    ).toEqual({ ranked: ['d', 'b'], unranked: ['c', 'a'] });
  });
});
