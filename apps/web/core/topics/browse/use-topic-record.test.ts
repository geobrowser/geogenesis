import { print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { topicRecordDocument } from './use-topic-record';

describe('the topic record query', () => {
  const source = print(topicRecordDocument).replace(/\s+/g, ' ');

  it('limits claims to this topic and the debate tag', () => {
    expect(source).toContain('typeId: {is: $topicsPropertyId}, toEntityId: {is: $topicId}');
    expect(source).toContain('typeId: {is: $tagPropertyId}, toEntityId: {is: $debateTagId}');
  });

  it('finds debates through claims carrying this topic without a bounded claim-id prefetch', () => {
    expect(source).toContain(
      'typeId: {is: $debateClaimsPropertyId}, toEntity: {relations: {some: {typeId: {is: $topicsPropertyId}'
    );
    expect(source).not.toContain('claimIds');
  });

  it('returns card rows and exact totals for both activity kinds in one request', () => {
    expect(source).toContain('claims: entitiesConnection');
    expect(source).toContain('debates: entitiesConnection');
    expect(source.match(/nodes \{/g)).toHaveLength(2);
  });
});
