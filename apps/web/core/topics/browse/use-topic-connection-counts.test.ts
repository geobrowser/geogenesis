import { print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { normId } from '~/core/utils/norm-id';

import { decodeTopicConnectionCounts, topicConnectionCountsDocument } from './use-topic-connection-counts';

describe('topicConnectionCountsDocument', () => {
  it('declares one variable and three buckets per topic', () => {
    const printed = print(topicConnectionCountsDocument(3));

    for (const index of [0, 1, 2]) {
      expect(printed).toContain(`$topic${index}: UUID!`);
      expect(printed).toContain(`claims${index}:`);
      expect(printed).toContain(`news${index}:`);
      expect(printed).toContain(`debates${index}:`);
    }
    expect(printed).not.toContain('$topic3');
  });

  it('reuses the parsed document for a given topic count', () => {
    expect(topicConnectionCountsDocument(2)).toBe(topicConnectionCountsDocument(2));
    expect(topicConnectionCountsDocument(2)).not.toBe(topicConnectionCountsDocument(4));
  });

  it('counts entities, not relations', () => {
    // The distinction the topic page's composition strip gets wrong by design: a claim carrying
    // `Topics` in two spaces is two relations and one claim, and this list is *ordered* by the
    // number, so it has to be a count of things.
    const printed = print(topicConnectionCountsDocument(1));

    expect(printed).toContain('entitiesConnection');
    expect(printed).not.toContain('relationsConnection');
  });

  it('reaches debates through the claims that name the topic, not through the topic', () => {
    const printed = print(topicConnectionCountsDocument(1)).replace(/\s+/g, ' ');

    expect(printed).toContain(
      'debates0: entitiesConnection( filter: {typeIds: {overlaps: $debateTypeIds}, relations: {some: {typeId: {is: $debateClaimsPropertyId}, toEntity: {relations: {some: {typeId: {is: $topicsPropertyId}, toEntityId: {is: $topic0}}}}}}} )'
    );

    // And a claim reaches its topic in one hop, so the two buckets cannot silently become the same
    // query.
    expect(printed).toContain(
      'claims0: entitiesConnection( filter: {typeIds: {overlaps: $claimTypeIds}, relations: {some: {typeId: {is: $topicsPropertyId}, toEntityId: {is: $topic0}}}} )'
    );
  });
});

describe('decodeTopicConnectionCounts', () => {
  const ids = ['AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'];

  it('puts each aliased bucket back on the id that asked for it, and totals them', () => {
    const decoded = decodeTopicConnectionCounts(
      {
        claims0: { totalCount: 117 },
        news0: { totalCount: 2 },
        debates0: { totalCount: 3 },
        claims1: { totalCount: 5 },
        news1: { totalCount: 0 },
        debates1: { totalCount: 0 },
      },
      ids
    );

    expect(decoded[normId(ids[0])]).toEqual({ claims: 117, news: 2, debates: 3, total: 122 });
    expect(decoded[normId(ids[1])]).toEqual({ claims: 5, news: 0, debates: 0, total: 5 });
  });

  it('reads a missing bucket as zero rather than as undefined', () => {
    const decoded = decodeTopicConnectionCounts({ claims0: { totalCount: 4 } }, [ids[0]]);

    expect(decoded[normId(ids[0])]).toEqual({ claims: 4, news: 0, debates: 0, total: 4 });
  });
});
