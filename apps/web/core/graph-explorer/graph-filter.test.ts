import { describe, expect, it } from 'vitest';

import { DEFAULT_GRAPH_FILTER, keepNeighbour, parseGraphFilterOverrides, resolveGraphFilter } from './graph-filter';
import { CLAIM_TYPE_ID, NEIGHBOUR_KIND_TYPE_IDS, TOPIC_TYPE_ID } from './ontology';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccccccccccccccc';

describe('resolveGraphFilter', () => {
  it('uses the scope spaces and the defaults', () => {
    const filter = resolveGraphFilter({ spaceIds: [B, A], topicId: null, topicSpaceId: null });
    expect(filter.spaceIds).toEqual([A, B]);
    expect(filter.includeTypeIds).toBe(DEFAULT_GRAPH_FILTER.includeTypeIds);
    expect(filter.excludeTypeIds).toBe(DEFAULT_GRAPH_FILTER.excludeTypeIds);
    expect(filter.relationTypeIds).toBe(DEFAULT_GRAPH_FILTER.relationTypeIds);
  });

  it('applies no space filter for the global scope', () => {
    expect(resolveGraphFilter({ spaceIds: null, topicId: null, topicSpaceId: null }).spaceIds).toBeUndefined();
  });

  it('replaces the spaces with `spaces` and widens them with `addSpaces`', () => {
    const scope = { spaceIds: [A], topicId: null, topicSpaceId: null } as const;
    expect(resolveGraphFilter(scope, { spaces: [C] }).spaceIds).toEqual([C]);
    expect(resolveGraphFilter(scope, { addSpaces: [C, A] }).spaceIds).toEqual([A, C]);
  });

  it('keeps the defaults when an override is empty', () => {
    const filter = resolveGraphFilter(
      { spaceIds: null, topicId: null, topicSpaceId: null },
      { types: [], relations: [] }
    );
    expect(filter.includeTypeIds).toBe(DEFAULT_GRAPH_FILTER.includeTypeIds);
    expect(filter.relationTypeIds).toBe(DEFAULT_GRAPH_FILTER.relationTypeIds);
  });

  it('replaces the type lists', () => {
    const filter = resolveGraphFilter(
      { spaceIds: null, topicId: null, topicSpaceId: null },
      { types: [A], excludeTypes: [] }
    );
    expect(filter.includeTypeIds).toEqual([A]);
    expect(filter.excludeTypeIds).toEqual([]);
  });
});

describe('space source', () => {
  const topicScope = { spaceIds: [A], topicId: B, topicSpaceId: null };

  it('says where the spaces came from', () => {
    expect(resolveGraphFilter(topicScope).spaceSource).toBe('topic');
    expect(resolveGraphFilter(topicScope, { spaces: [C] }).spaceSource).toBe('selected');
    expect(resolveGraphFilter(topicScope, { addSpaces: [C] }).spaceSource).toBe('selected');
    expect(resolveGraphFilter({ spaceIds: null, topicId: B, topicSpaceId: null }).spaceSource).toBe('all');
  });

  it('keeps the topic lens without a space scope', () => {
    expect(resolveGraphFilter({ spaceIds: null, topicId: B, topicSpaceId: null }).claimsTopicId).toBe(B);
  });
});

describe('claims topic', () => {
  it('requires the topic on claims in a topic scope', () => {
    expect(resolveGraphFilter({ spaceIds: [A], topicId: B, topicSpaceId: null }).claimsTopicId).toBe(B);
  });

  it('is lifted by ?claims=all and absent in the global view', () => {
    expect(resolveGraphFilter({ spaceIds: [A], topicId: B, topicSpaceId: null }, { claims: 'all' }).claimsTopicId).toBe(
      undefined
    );
    expect(resolveGraphFilter({ spaceIds: null, topicId: null, topicSpaceId: null }).claimsTopicId).toBeUndefined();
  });

  it('reads ?claims=all and ignores other values', () => {
    expect(parseGraphFilterOverrides(new URLSearchParams('claims=all')).claims).toBe('all');
    expect(parseGraphFilterOverrides(new URLSearchParams('claims=topic')).claims).toBeUndefined();
  });
});

describe('parseGraphFilterOverrides', () => {
  it('reads comma-separated ids, normalising dashes and dropping junk', () => {
    const params = new URLSearchParams({
      spaces: `${A}, not-an-id ,${A}`,
      addSpaces: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      types: C,
    });
    expect(parseGraphFilterOverrides(params)).toEqual({ spaces: [A], addSpaces: [B], types: [C] });
  });

  it('leaves absent params out', () => {
    expect(parseGraphFilterOverrides(new URLSearchParams())).toEqual({});
  });
});

describe('keepNeighbour', () => {
  const filter = resolveGraphFilter({ spaceIds: null, topicId: null, topicSpaceId: null });

  it('keeps the Who’s who kinds', () => {
    expect(keepNeighbour([TOPIC_TYPE_ID], filter)).toBe(true);
    expect(keepNeighbour([NEIGHBOUR_KIND_TYPE_IDS.person[0]], filter)).toBe(true);
    expect(keepNeighbour([NEIGHBOUR_KIND_TYPE_IDS.court[0]], filter)).toBe(true);
  });

  it('drops types outside the allowlist', () => {
    expect(keepNeighbour([A], filter)).toBe(false);
    expect(keepNeighbour([], filter)).toBe(false);
  });

  it('lets an excluded type win over an included one', () => {
    expect(keepNeighbour([TOPIC_TYPE_ID, CLAIM_TYPE_ID], filter)).toBe(false);
  });
});
