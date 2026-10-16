import { describe, expect, it } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';

import { topicFilterClauses } from './explore-topic-filter';

const PHILOSOPHY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ETHICS = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function clauseFor(topicId: string) {
  return { relations: { some: { typeId: { is: TOPICS_PROPERTY_ID }, toEntityId: { is: topicId } } } };
}

describe('the explore topics clauses', () => {
  it('is nothing at all when no topic is picked', () => {
    expect(topicFilterClauses(undefined)).toEqual({});
    expect(topicFilterClauses([])).toEqual({});
  });

  it('is a single `and`, so spreading it cannot displace the clauses it joins', () => {
    expect(Object.keys(topicFilterClauses([PHILOSOPHY]))).toEqual(['and']);
  });

  it('matches the topic by relation type and target', () => {
    // `typeId` is what scopes this to Topics.
    expect(topicFilterClauses([PHILOSOPHY]).and).toEqual([clauseFor(PHILOSOPHY)]);
  });

  it('gives each topic its own clause, which is what makes the selection an intersection', () => {
    expect(topicFilterClauses([PHILOSOPHY, ETHICS]).and).toEqual([clauseFor(PHILOSOPHY), clauseFor(ETHICS)]);
  });

  it('passes ids through as given, leaving normalization to the caller', () => {
    const dashed = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    expect(topicFilterClauses([dashed]).and).toEqual([clauseFor(dashed)]);
  });

  it('does not alias the caller’s array', () => {
    const topics = [PHILOSOPHY];
    const filter = topicFilterClauses(topics);
    topics.push(ETHICS);

    expect(filter.and).toHaveLength(1);
  });
});
