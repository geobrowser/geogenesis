import { describe, expect, it } from 'vitest';

import { buildTopicPills } from './feed-topic-pills';

const t = (id: string, name: string) => ({ id, name });

describe('buildTopicPills', () => {
  const suggestions = [t('a', 'Bitcoin'), t('b', 'AI safety'), t('c', 'Mental health')];

  it('shows suggestions in rank order when there is no query', () => {
    expect(buildTopicPills({ suggestions, searchResults: [], hasQuery: false, selected: [] })).toEqual(suggestions);
  });

  it('keeps a pick visible when the list no longer contains it', () => {
    const pills = buildTopicPills({
      suggestions,
      searchResults: [t('x', 'Crypto')],
      hasQuery: true,
      selected: [t('b', 'AI safety')],
    });
    expect(pills.map(p => p.id)).toEqual(['b', 'x']);
  });

  it('does not repeat a pick that is already listed', () => {
    const pills = buildTopicPills({
      suggestions,
      searchResults: [],
      hasQuery: false,
      selected: [t('c', 'Mental health')],
    });
    expect(pills.map(p => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('gives a search hit named like a suggestion the suggestion id', () => {
    const pills = buildTopicPills({
      suggestions,
      searchResults: [t('other-bitcoin', 'bitcoin'), t('y', 'Bitcoin ETFs')],
      hasQuery: true,
      selected: [],
    });
    expect(pills).toEqual([t('a', 'Bitcoin'), t('y', 'Bitcoin ETFs')]);
  });

  it('keeps one pill per name among search hits', () => {
    const pills = buildTopicPills({
      suggestions: [],
      searchResults: [t('1', 'Crypto'), t('2', 'Crypto'), t('3', 'Crypto jobs')],
      hasQuery: true,
      selected: [],
    });
    expect(pills.map(p => p.id)).toEqual(['1', '3']);
  });

  it('matches a pick against a dashed id', () => {
    const id = '115c8d4a13b04b8aa4147e69a64aa040';
    const dashed = '115c8d4a-13b0-4b8a-a414-7e69a64aa040';
    const pills = buildTopicPills({
      suggestions: [t(id, 'Bitcoin')],
      searchResults: [],
      hasQuery: false,
      selected: [t(dashed, 'Bitcoin')],
    });
    expect(pills).toHaveLength(1);
  });
});
