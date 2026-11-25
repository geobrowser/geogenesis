import { describe, expect, it } from 'vitest';

import { CLAIM_RESPONSE_OBJECT_TYPE } from '~/core/claims/browse/claim-response-summary';
import { entityResponseCountsQueryKey } from '~/core/responses/entity-response';
import { ARTICLE_TYPE_ID } from '~/core/topics/ontology';

import type { GraphEdge, GraphNode } from './fetch-graph-neighbourhood';
import fallbacks from './fixtures/testnet-fallback-labels.json';
import { CONTENT_RELATION_LABELS, GRAPH_KINDS, type GraphKind, type RowCentre } from './graph-kinds';
import { RELATION_LABELS } from './ontology';
import {
  agreementLine,
  bandTally,
  claimRowLine,
  groupByKind,
  latestNews,
  mostLinked,
  rowLabels,
  rowPublisher,
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

const centreOf = (kind: GraphKind, ...typeNames: string[]): RowCentre => ({ kind, typeNames });
const TOPIC = centreOf('topic', 'Topic');

describe('row labels that repeat the group', () => {
  it.each<[string, Parameters<typeof rowLabels>[0], ReturnType<typeof rowLabels>]>([
    [
      'Topics drops Topic above and below',
      { kind: 'topic', relations: ['Topic'], typeLabel: 'Topic', centre: TOPIC },
      { relation: null, sub: null },
    ],
    [
      'Topics drops a plural Topics',
      { kind: 'topic', relations: ['topics'], centre: TOPIC },
      { relation: null, sub: null },
    ],
    [
      'Topics keeps the labels that say how a topic is linked',
      {
        kind: 'topic',
        relations: ['Topic', 'On this topic', 'Subtopic', 'Broader topic'],
        typeLabel: 'Topic',
        centre: TOPIC,
      },
      { relation: 'Subtopic · Broader topic', sub: null },
    ],
    [
      'a Topics (incoming) fallback goes on a topic centre',
      { kind: 'topic', relations: ['Topics (incoming)'], typeLabel: 'Topic', centre: TOPIC },
      { relation: null, sub: null },
    ],
    [
      'a Claims (incoming) fallback goes on a claim centre, the debate type stays',
      { kind: 'other', relations: ['Claims (incoming)'], typeLabel: 'Debate', centre: centreOf('claim', 'Claim') },
      { relation: null, sub: 'Debate' },
    ],
    [
      'a Source (incoming) fallback goes on a news article centre',
      {
        kind: 'event',
        relations: ['Source (incoming)'],
        typeLabel: 'Case event',
        centre: centreOf('src', 'News article'),
      },
      { relation: null, sub: 'Case event' },
    ],
    [
      'a Debates (incoming) fallback goes on a debate centre',
      { kind: 'other', relations: ['Debates (incoming)'], typeLabel: 'Vote', centre: centreOf('other', 'Debate') },
      { relation: null, sub: 'Vote' },
    ],
    [
      'a Debates (incoming) fallback stays on a centre that is not a debate',
      { kind: 'other', relations: ['Debates (incoming)'], typeLabel: 'Vote', centre: TOPIC },
      { relation: 'Debates (incoming)', sub: 'Vote' },
    ],
    [
      'a Skills (incoming) fallback goes on a skill centre',
      { kind: 'other', relations: ['Skills (incoming)'], typeLabel: 'Person', centre: centreOf('other', 'Skill') },
      { relation: null, sub: 'Person' },
    ],
    [
      'an (incoming) fallback named for any of the centre types goes, a role noun too',
      { kind: 'ent', relations: ['Investors (incoming)'], centre: centreOf('ent', 'Company', 'Investor') },
      { relation: null, sub: null },
    ],
    [
      'an incoming fallback named for a noun the centre is not stays',
      { kind: 'ent', relations: ['Countries (incoming)'], typeLabel: 'Person', centre: TOPIC },
      { relation: 'Countries (incoming)', sub: 'Person' },
    ],
    [
      'an incoming fallback that says how stays on a claim centre',
      { kind: 'claim', relations: ['Claims (incoming)', 'Addresses (incoming)'], centre: centreOf('claim', 'Claim') },
      { relation: 'Addresses (incoming)', sub: null },
    ],
    [
      'Addresses (incoming) stays on a topic centre',
      { kind: 'claim', relations: ['Addresses (incoming)'], centre: TOPIC },
      { relation: 'Addresses (incoming)', sub: null },
    ],
    [
      // labelKey strips only "s"/"ies": an "-es" rule would read the verb Addresses as the type Address.
      'Addresses (incoming) stays even on an address centre',
      { kind: 'claim', relations: ['Addresses (incoming)'], centre: centreOf('other', 'Address') },
      { relation: 'Addresses (incoming)', sub: null },
    ],
    [
      'an out label naming the row second type goes',
      {
        kind: 'ent',
        relations: ['Investors', 'Founder'],
        typeLabel: 'Company',
        typeNames: ['Company', 'Investor'],
        centre: TOPIC,
      },
      { relation: 'Founder', sub: 'Company' },
    ],
    [
      'an out label naming the centre type stays: it names the row, not the centre',
      { kind: 'ent', relations: ['Topics'], typeLabel: 'Person', centre: TOPIC },
      { relation: 'Topics', sub: 'Person' },
    ],
    [
      'a -ies plural relation that repeats the row type goes',
      { kind: 'ent', relations: ['Countries'], typeLabel: 'Country', centre: TOPIC },
      { relation: null, sub: 'Country' },
    ],
    [
      'News drops a fallback Stories',
      { kind: 'story', relations: ['Stories'], typeLabel: 'News story', centre: TOPIC },
      { relation: null, sub: null },
    ],
    ['Claims drops Claims', { kind: 'claim', relations: ['Claims'], centre: TOPIC }, { relation: null, sub: null }],
    [
      'Claims keeps Opposed by beside a dropped label',
      { kind: 'claim', relations: ['Claims', 'Opposed by'], centre: TOPIC },
      { relation: 'Opposed by', sub: null },
    ],
    [
      'News drops Story, Story in and News story, and keeps the date',
      { kind: 'story', relations: ['Story', 'Story in'], typeLabel: 'News story', date: 'Nov 3, 2026', centre: TOPIC },
      { relation: null, sub: 'Nov 3, 2026' },
    ],
    [
      'Sources keeps Cited by and a type that differs',
      {
        kind: 'src',
        relations: ['Source', 'Cited by'],
        typeLabel: 'Article',
        date: 'Oct 1, 2026',
        centre: TOPIC,
      },
      { relation: 'Cited by', sub: 'Article · Oct 1, 2026' },
    ],
    [
      'Court cases drops Legal case',
      { kind: 'case', relations: ['Defendant'], typeLabel: 'Legal case', centre: TOPIC },
      { relation: 'Defendant', sub: null },
    ],
    [
      'People and groups keeps Person',
      { kind: 'ent', relations: ['Actor'], typeLabel: 'Person', centre: TOPIC },
      { relation: 'Actor', sub: 'Person' },
    ],
    [
      'Other keeps every type, even Topic',
      { kind: 'other', relations: ['Mentions'], typeLabel: 'Topic', centre: TOPIC },
      { relation: 'Mentions', sub: 'Topic' },
    ],
    // The rows in Preston's screenshot of the Israel-Gaza war map (GEO-3840).
    [
      'People and groups drops Related entity and keeps Organization',
      { kind: 'ent', relations: ['Related entity'], typeLabel: 'Organization', centre: TOPIC },
      { relation: null, sub: 'Organization' },
    ],
    [
      'People and groups drops Related person and keeps Person',
      { kind: 'ent', relations: ['Related person'], typeLabel: 'Person', centre: TOPIC },
      { relation: null, sub: 'Person' },
    ],
    [
      'News drops On this topic and keeps the date',
      { kind: 'story', relations: ['On this topic'], typeLabel: 'News story', date: 'Jan 26, 2024', centre: TOPIC },
      { relation: null, sub: 'Jan 26, 2024' },
    ],
    [
      'Sources drops On this topic and keeps Article',
      { kind: 'src', relations: ['On this topic'], typeLabel: 'Article', centre: TOPIC },
      { relation: null, sub: 'Article' },
    ],
    [
      'a generic label goes beside a specific one',
      { kind: 'ent', relations: ['Related to', 'Plaintiff'], typeLabel: 'Country', centre: TOPIC },
      { relation: 'Plaintiff', sub: 'Country' },
    ],
    [
      'Claims drops Related claim and Related to, keeps Supports',
      { kind: 'claim', relations: ['Related claim', 'Related to', 'Supports'], centre: TOPIC },
      { relation: 'Supports', sub: null },
    ],
    [
      'generic fallback labels go: Relation and any Related …',
      {
        kind: 'other',
        relations: ['Relation (incoming)', 'Related topics (incoming)', 'Related spaces'],
        centre: TOPIC,
      },
      { relation: null, sub: null },
    ],
    [
      'a relation that only repeats the row type goes, the type stays',
      { kind: 'ent', relations: ['Publisher'], typeLabel: 'Publisher', centre: TOPIC },
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
        expect([kind, label, rowLabels({ kind, relations: [label], centre: centreOf('other') }).relation]).toEqual([
          kind,
          label,
          generic.includes(label) || dropped[kind]?.includes(label) ? null : label,
        ]);
  });
});

/**
 * The 100 most used testnet relation properties with no label of their own, as a row reads them
 * (the property's name, or "<name> (incoming)" from its target). `type` is the testnet Type whose
 * name matches by labelKey, if any: that fallback only names an end, so it goes there and only there.
 */
describe('testnet fallback labels', () => {
  const unrelated = centreOf('other', 'Thing');
  const out = (name: string, typeNames: string[]) =>
    rowLabels({ kind: 'other', relations: [name], typeNames, centre: unrelated }).relation;
  const incoming = (name: string, centre: RowCentre) =>
    rowLabels({ kind: 'other', relations: [`${name} (incoming)`], centre }).relation;

  it.each(fallbacks)('$name', ({ name, type }) => {
    const generic = /^related\b/i.test(name);
    expect(out(name, ['Thing'])).toBe(generic ? null : name);
    expect(incoming(name, unrelated)).toBe(generic ? null : `${name} (incoming)`);
    if (type) {
      expect(out(name, ['Thing', type])).toBeNull();
      expect(incoming(name, centreOf('other', 'Thing', type))).toBeNull();
    }
  });

  it('covers the type-named fallbacks the old kind-noun list missed', () => {
    const typed = new Set(fallbacks.filter(f => f.type).map(f => f.name));
    for (const name of ['Skills', 'City', 'Podcast', 'Books', 'Investors', 'Political party'])
      expect(typed).toContain(name);
    expect(typed).not.toContain('Addresses');
    expect(typed).not.toContain('Lives in');
  });
});

describe('claimRowLine', () => {
  it('reads like the prototype row: the percent from the threshold, the votes below it, none at zero', () => {
    expect(claimRowLine(undefined)).toBeNull();
    expect(claimRowLine({ positive: 0, negative: 0 })).toBe('No votes yet');
    expect(claimRowLine({ positive: 1, negative: 1 })).toBe('2 votes');
    expect(claimRowLine({ positive: 63, negative: 37 })).toBe('63% agree');
  });
});

describe('source rows', () => {
  const publisher = { id: id(9), name: 'BBC Verify', image: null };

  it('puts the publisher between the type and the date', () => {
    const centre: RowCentre = { kind: 'claim', typeNames: ['Claim'] };
    expect(
      rowLabels({ kind: 'src', relations: [], centre, typeLabel: 'Report', publisher: 'BBC Verify', date: '2025' }).sub
    ).toBe('Report · BBC Verify · 2025');
    expect(rowLabels({ kind: 'src', relations: [], centre, publisher: 'Times of Israel', date: 'Jan 2026' }).sub).toBe(
      'Times of Israel · Jan 2026'
    );
  });

  it('names a source’s or story’s publisher, but not on the publisher’s own panel or for other kinds', () => {
    expect(rowPublisher(node(1, 'src', { publisher }), id(2))).toBe(publisher);
    expect(rowPublisher(node(1, 'story', { publisher }), null)).toBe(publisher);
    expect(rowPublisher(node(1, 'src', { publisher }), id(9).toUpperCase())).toBeNull();
    expect(rowPublisher(node(1, 'ent', { publisher }), id(2))).toBeNull();
    expect(rowPublisher(node(1, 'src'), id(2))).toBeNull();
    expect(rowPublisher(undefined, id(2))).toBeNull();
  });
});
