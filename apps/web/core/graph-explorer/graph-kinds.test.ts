import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { parseGraphFilterOverrides, resolveGraphFilter } from './graph-filter';
import { GRAPH_KINDS, GRAPH_KIND_TYPE_IDS, NEWS_EVENT_TYPE_ID, graphKindOf, graphTypeRank } from './graph-kinds';
import { CLAIM_TYPE_ID, NEIGHBOUR_KIND_TYPE_IDS, TOPIC_TYPE_ID } from './ontology';

const PERSON = NEIGHBOUR_KIND_TYPE_IDS.person[0];
const ARTICLE = GRAPH_KIND_TYPE_IDS.src[0];

describe('graphKindOf', () => {
  it('reads a person who is also a topic as a person, and a topic alone as a topic', () => {
    expect(graphKindOf([TOPIC_TYPE_ID, PERSON])).toBe('ent');
    expect(graphKindOf([TOPIC_TYPE_ID])).toBe('topic');
  });

  it('reads a topic timeline as a topic, and a bare timeline as an event', () => {
    const TIMELINE = '3b22262d7919441db1a839eee9c2b3e9';
    expect(graphKindOf([TIMELINE, TOPIC_TYPE_ID])).toBe('topic');
    expect(graphKindOf([TIMELINE])).toBe('event');
  });

  it('reads a News event as an event even though it is typed Claim', () => {
    expect(graphKindOf([CLAIM_TYPE_ID, NEWS_EVENT_TYPE_ID])).toBe('event');
    expect(graphKindOf([CLAIM_TYPE_ID])).toBe('claim');
  });

  it('takes the highest-priority kind; unlisted types are Other, plumbing is nothing', () => {
    expect(graphKindOf([ARTICLE, CLAIM_TYPE_ID])).toBe('claim');
    expect(graphKindOf(['f'.repeat(32)])).toBe('other');
    expect(graphKindOf([])).toBe('other');
    expect(graphKindOf([SystemIds.PAGE_TYPE])).toBeNull();
    expect(graphKindOf([SystemIds.PAGE_TYPE, CLAIM_TYPE_ID])).toBe('claim');
    expect(graphKindOf([ARTICLE.toUpperCase()])).toBe('src');
  });
});

describe('graphTypeRank', () => {
  it('puts people before places within People and groups', () => {
    const place = NEIGHBOUR_KIND_TYPE_IDS.place[0];
    expect(graphTypeRank('ent', [PERSON])).toBeLessThan(graphTypeRank('ent', [place]));
  });
});

describe('kinds in the filter', () => {
  it('shows every kind by default, in priority order', () => {
    expect(resolveGraphFilter(null).kinds).toEqual(GRAPH_KINDS);
    expect(GRAPH_KINDS.slice(0, 3)).toEqual(['topic', 'ent', 'claim']);
  });

  it('narrows to ?kinds=, ignoring unknown names', () => {
    const overrides = parseGraphFilterOverrides(new URLSearchParams('kinds=claim,nope,ent'));
    expect(resolveGraphFilter(null, overrides).kinds).toEqual(['ent', 'claim']);
    expect(parseGraphFilterOverrides(new URLSearchParams('kinds=nope')).kinds).toBeUndefined();
  });
});
