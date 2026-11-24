import { describe, expect, it } from 'vitest';

import { parseGraphFilterOverrides, resolveGraphFilter } from './graph-filter';
import { GRAPH_KINDS } from './graph-kinds';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccccccccccccccc';

describe('resolveGraphFilter', () => {
  it('uses the scope spaces and the defaults', () => {
    const filter = resolveGraphFilter({ spaceIds: [B, A], topicId: null, topicSpaceId: null });
    expect(filter.spaceIds).toEqual([A, B]);
    expect(filter.kinds).toBe(GRAPH_KINDS);
  });

  it('applies no space filter for the global scope', () => {
    expect(resolveGraphFilter({ spaceIds: null, topicId: null, topicSpaceId: null }).spaceIds).toBeUndefined();
  });

  it('replaces the spaces with `spaces` and widens them with `addSpaces`', () => {
    const scope = { spaceIds: [A], topicId: null, topicSpaceId: null } as const;
    expect(resolveGraphFilter(scope, { spaces: [C] }).spaceIds).toEqual([C]);
    expect(resolveGraphFilter(scope, { addSpaces: [C, A] }).spaceIds).toEqual([A, C]);
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
    expect(resolveGraphFilter({ spaceIds: null, topicId: B, topicSpaceId: null }).topicLensId).toBe(B);
  });
});

describe('claims topic', () => {
  it('requires the topic on claims in a topic scope', () => {
    expect(resolveGraphFilter({ spaceIds: [A], topicId: B, topicSpaceId: null }).topicLensId).toBe(B);
  });

  it('is lifted by ?lens=off and absent in the global view', () => {
    expect(resolveGraphFilter({ spaceIds: [A], topicId: B, topicSpaceId: null }, { lens: 'off' }).topicLensId).toBe(
      undefined
    );
    expect(resolveGraphFilter({ spaceIds: null, topicId: null, topicSpaceId: null }).topicLensId).toBeUndefined();
  });

  it('reads ?lens=off, and ?claims=all as the same, ignoring other values', () => {
    expect(parseGraphFilterOverrides(new URLSearchParams('lens=off')).lens).toBe('off');
    expect(parseGraphFilterOverrides(new URLSearchParams('claims=all')).lens).toBe('off');
    expect(parseGraphFilterOverrides(new URLSearchParams('lens=on')).lens).toBeUndefined();
    expect(parseGraphFilterOverrides(new URLSearchParams('claims=topic')).lens).toBeUndefined();
  });
});

describe('parseGraphFilterOverrides', () => {
  it('reads comma-separated ids, normalising dashes and dropping junk', () => {
    const params = new URLSearchParams({
      spaces: `${A}, not-an-id ,${A}`,
      addSpaces: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    });
    expect(parseGraphFilterOverrides(params)).toEqual({ spaces: [A], addSpaces: [B] });
  });

  it('leaves absent params out', () => {
    expect(parseGraphFilterOverrides(new URLSearchParams())).toEqual({});
  });
});
