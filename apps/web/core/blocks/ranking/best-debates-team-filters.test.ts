import { describe, expect, it } from 'vitest';

import { type TeamFilterDisplay, filterTeamIds, groupBySpace, topicOptions } from './best-debates-team-filters';

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

  it('keeps a debate carrying any picked topic, and combines with search', () => {
    expect(filterTeamIds(['a', 'b', 'c', 'd'], displayOf, { query: '', topicIds: ['tlaw'] })).toEqual(['b', 'c']);
    expect(filterTeamIds(['a', 'b', 'c', 'd'], displayOf, { query: '', topicIds: ['tlaw', 'tecon'] })).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
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
