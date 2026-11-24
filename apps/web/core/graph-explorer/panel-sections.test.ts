import { describe, expect, it } from 'vitest';

import { CLAIM_RESPONSE_OBJECT_TYPE } from '~/core/claims/browse/claim-response-summary';
import { entityResponseCountsQueryKey } from '~/core/responses/entity-response';
import { ARTICLE_TYPE_ID } from '~/core/topics/ontology';

import type { GraphEdge, GraphNode } from './fetch-graph-neighbourhood';
import { CONTENT_RELATION_LABELS, GRAPH_KINDS, type GraphKind } from './graph-kinds';
import { RELATION_LABELS } from './ontology';
import {
  agreementLine,
  bandTally,
  groupByKind,
  latestNews,
  mostLinked,
  rowLabels,
  shownAgreement,
  topClaimsInBand,
} from './panel-sections';
import type { GraphSelection } from './select-graph';
import type { Spoke } from './spokes';
import { type SummarisedClaim, claimCountsKey } from './topic-claims-summary';

const id = (n: number) => String(n).padStart(32, '0');
const node = (n: number, kind: GraphKind, extra: Partial<GraphNode> = {}): GraphNode => ({
  id: id(n),
  name: `Node ${n}`,
  spaceIds: [],
  namedSpaceIds: [],
  placedSpaceIds: [],
  types: [{ id: 'type', name: kind === 'ent' ? 'Person' : 'Thing' }],
  image: null,
  kind,
  typeRank: 0,
  date: null,
  agrees: 0,
  disagrees: 0,
  ...extra,
});
const edge = (from: number, to: number): GraphEdge => ({
  id: `${from}-${to}`,
  fromId: id(from),
  toId: id(to),
  propertyId: 'p',
  propertyName: null,
  spaceId: 's',
});
const claim = (n: number, positive: number, negative: number, band: SummarisedClaim['band']): SummarisedClaim => ({
  id: id(n),
  name: `Claim ${n}`,
  spaceId: 's',
  positive,
  negative,
  band,
});

describe('agreement below and above the threshold', () => {
  it('shows a percent and band only from 3 votes', () => {
    expect(shownAgreement({ positive: 2, negative: 0 })).toEqual({ total: 2, percent: null, band: null });
    expect(shownAgreement({ positive: 2, negative: 1 })).toEqual({ total: 3, percent: 67, band: 'agreed' });
    expect(agreementLine(undefined)).toBeNull();
    expect(agreementLine({ positive: 0, negative: 0 })).toBe('No votes yet');
    expect(agreementLine({ positive: 1, negative: 0 })).toBe('1 vote');
    expect(agreementLine({ positive: 700, negative: 600 })).toBe('54% agree · 1,300 votes');
  });

  it('tallies only banded claims', () => {
    expect(
      bandTally([{ positive: 5, negative: 0 }, { positive: 1, negative: 1 }, undefined, { positive: 1, negative: 4 }])
    ).toEqual({ bands: { agreed: 1, contested: 0, rejected: 1 }, banded: 2 });
  });
});

describe('topic overview lists', () => {
  it('takes the most-voted claims in a band with 3+ votes, four at most', () => {
    const claims = [
      claim(1, 3, 3, 'contested'),
      claim(2, 1, 1, 'contested'),
      claim(3, 40, 40, 'contested'),
      claim(4, 9, 1, 'agreed'),
      ...[5, 6, 7, 8].map(n => claim(n, n, n, 'contested')),
    ];
    expect(topClaimsInBand(claims, 'contested').map(entry => entry.name)).toEqual([
      'Claim 3',
      'Claim 8',
      'Claim 7',
      'Claim 6',
    ]);
    expect(topClaimsInBand(claims, 'agreed').map(entry => entry.name)).toEqual(['Claim 4']);
    expect(topClaimsInBand([claim(2, 1, 1, 'contested')], 'contested')).toEqual([]);
  });

  it('ranks people and groups by lines on the map, leaving out the centre and the unlinked', () => {
    const selection: GraphSelection = {
      nodes: [node(1, 'topic'), node(2, 'ent'), node(3, 'ent'), node(4, 'ent'), node(5, 'claim')].map(entry => ({
        node: entry,
        hop: 1,
        parentId: null,
      })),
      links: [edge(1, 2), edge(1, 3), edge(3, 5), edge(5, 3)].map(entry => ({ edge: entry, hop: 1 })),
    };
    expect(mostLinked(selection, id(1)).map(entry => [entry.node.name, entry.links])).toEqual([
      ['Node 3', 3],
      ['Node 2', 1],
    ]);
    expect(mostLinked(null, id(1))).toEqual([]);
  });

  it('lists dated stories and articles newest first, and never guesses a date', () => {
    const article = { types: [{ id: ARTICLE_TYPE_ID, name: 'Article' }] };
    const news = latestNews([
      node(1, 'story', { date: '2025-03-01T00:00:00Z' }),
      node(2, 'src', { ...article, date: '2025-06-01T00:00:00Z' }),
      node(3, 'story', { date: null }),
      node(4, 'src', { date: '2025-09-01T00:00:00Z' }),
      node(5, 'story', { date: 'not a date' }),
      node(1, 'story', { date: '2025-03-01T00:00:00Z' }),
    ]);
    expect(news.map(entry => entry.node.name)).toEqual(['Node 2', 'Node 1']);
    expect(latestNews([node(3, 'story')])).toEqual([]);
  });
});

describe('grouping by kind', () => {
  it('follows the prototype order and puts unknown neighbours in Other', () => {
    const spoke = (n: number): Spoke => ({
      entity: node(n, 'other'),
      labels: ['Related'],
      edgeSpaceIds: [],
      nodeSpaceId: null,
      hasOutgoing: true,
    });
    const nodes = new Map([
      [id(1), node(1, 'topic')],
      [id(2), node(2, 'claim')],
      [id(3), node(3, 'ent')],
      [id(4), node(4, 'case')],
    ]);
    expect(groupByKind([1, 2, 3, 4, 9].map(spoke), nodes).map(group => group.kind)).toEqual([
      'claim',
      'case',
      'ent',
      'topic',
      'other',
    ]);
    expect(groupByKind([], nodes)).toEqual([]);
  });
});

describe('one vote, every view', () => {
  it('has the topic summary read the cache the rows, vote box and map nodes read', () => {
    const claim = { id: id(7), name: 'A claim', spaceId: 'space' };
    // Rows and map nodes read it through useClaimResponseSummary(id, spaceId, 'stance').
    expect(claimCountsKey(claim)).toEqual(
      entityResponseCountsQueryKey(claim.id, claim.spaceId, CLAIM_RESPONSE_OBJECT_TYPE, 'stance')
    );
  });
});

describe('row labels that repeat the group', () => {
  it.each<[string, Parameters<typeof rowLabels>[0], ReturnType<typeof rowLabels>]>([
    [
      'Topics drops Topic above and below',
      { kind: 'topic', relations: ['Topic'], typeLabel: 'Topic' },
      { relation: null, sub: null },
    ],
    ['Topics drops a plural Topics', { kind: 'topic', relations: ['topics'] }, { relation: null, sub: null }],
    [
      'Topics keeps the labels that say how a topic is linked',
      { kind: 'topic', relations: ['Topic', 'On this topic', 'Subtopic', 'Broader topic'], typeLabel: 'Topic' },
      { relation: 'Subtopic · Broader topic', sub: null },
    ],
    [
      'Topics drops a bare Topics (incoming) fallback',
      { kind: 'topic', relations: ['Topics (incoming)'], typeLabel: 'Topic' },
      { relation: null, sub: null },
    ],
    [
      'Other drops Claims (incoming) on a debate and keeps Debate below',
      { kind: 'other', relations: ['Claims (incoming)'], typeLabel: 'Debate' },
      { relation: null, sub: 'Debate' },
    ],
    [
      'an incoming fallback that says how stays',
      { kind: 'claim', relations: ['Claims (incoming)', 'Addresses (incoming)'] },
      { relation: 'Addresses (incoming)', sub: null },
    ],
    [
      'a -ies plural relation that repeats the row type goes',
      { kind: 'ent', relations: ['Countries'], typeLabel: 'Country' },
      { relation: null, sub: 'Country' },
    ],
    [
      'News drops a fallback Stories',
      { kind: 'story', relations: ['Stories'], typeLabel: 'News story' },
      { relation: null, sub: null },
    ],
    ['Claims drops Claims', { kind: 'claim', relations: ['Claims'] }, { relation: null, sub: null }],
    [
      'Claims keeps Opposed by beside a dropped label',
      { kind: 'claim', relations: ['Claims', 'Opposed by'] },
      { relation: 'Opposed by', sub: null },
    ],
    [
      'News drops Story, Story in and News story, and keeps the date',
      { kind: 'story', relations: ['Story', 'Story in'], typeLabel: 'News story', date: 'Nov 3, 2026' },
      { relation: null, sub: 'Nov 3, 2026' },
    ],
    [
      'Sources keeps Cited by and a type that differs',
      { kind: 'src', relations: ['Source', 'Cited by'], typeLabel: 'Article', date: 'Oct 1, 2026' },
      { relation: 'Cited by', sub: 'Article · Oct 1, 2026' },
    ],
    [
      'Court cases drops Legal case',
      { kind: 'case', relations: ['Defendant'], typeLabel: 'Legal case' },
      { relation: 'Defendant', sub: null },
    ],
    [
      'People and groups keeps Person',
      { kind: 'ent', relations: ['Actor'], typeLabel: 'Person' },
      { relation: 'Actor', sub: 'Person' },
    ],
    [
      'Other keeps every type, even Topic',
      { kind: 'other', relations: ['Mentions'], typeLabel: 'Topic' },
      { relation: 'Mentions', sub: 'Topic' },
    ],
    // The rows in Preston's screenshot of the Israel-Gaza war map (GEO-3840).
    [
      'People and groups drops Related entity and keeps Organization',
      { kind: 'ent', relations: ['Related entity'], typeLabel: 'Organization' },
      { relation: null, sub: 'Organization' },
    ],
    [
      'People and groups drops Related person and keeps Person',
      { kind: 'ent', relations: ['Related person'], typeLabel: 'Person' },
      { relation: null, sub: 'Person' },
    ],
    [
      'News drops On this topic and keeps the date',
      { kind: 'story', relations: ['On this topic'], typeLabel: 'News story', date: 'Jan 26, 2024' },
      { relation: null, sub: 'Jan 26, 2024' },
    ],
    [
      'Sources drops On this topic and keeps Article',
      { kind: 'src', relations: ['On this topic'], typeLabel: 'Article' },
      { relation: null, sub: 'Article' },
    ],
    [
      'a generic label goes beside a specific one',
      { kind: 'ent', relations: ['Related to', 'Plaintiff'], typeLabel: 'Country' },
      { relation: 'Plaintiff', sub: 'Country' },
    ],
    [
      'Claims drops Related claim and Related to, keeps Supports',
      { kind: 'claim', relations: ['Related claim', 'Related to', 'Supports'] },
      { relation: 'Supports', sub: null },
    ],
    [
      'generic fallback labels go: Relation and any Related …',
      { kind: 'other', relations: ['Relation (incoming)', 'Related topics (incoming)', 'Related spaces'] },
      { relation: null, sub: null },
    ],
    [
      'a relation that only repeats the row type goes, the type stays',
      { kind: 'ent', relations: ['Publisher'], typeLabel: 'Publisher' },
      { relation: null, sub: 'Publisher' },
    ],
  ])('%s', (_, input, expected) => {
    expect(rowLabels(input)).toEqual(expected);
  });

  it('keeps every real relation label that says how a row connects, in every group', () => {
    const generic = ['Topic', 'On this topic', 'Related person', 'Related project', 'Related entity'];
    generic.push('Related to', 'Related claim', 'Related story');
    const dropped: Partial<Record<GraphKind, string[]>> = {
      story: ['Story', 'Story in'],
      event: ['Event'],
      src: ['Source'],
    };
    const labels = [...Object.values(RELATION_LABELS), ...Object.values(CONTENT_RELATION_LABELS)].flatMap(l => [
      l.out,
      l.in,
    ]);
    for (const kind of GRAPH_KINDS)
      for (const label of new Set(labels))
        expect([kind, label, rowLabels({ kind, relations: [label] }).relation]).toEqual([
          kind,
          label,
          generic.includes(label) || dropped[kind]?.includes(label) ? null : label,
        ]);
  });
});
