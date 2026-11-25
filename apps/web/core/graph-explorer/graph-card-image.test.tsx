// @vitest-environment node
import * as React from 'react';

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { TopicClaimsSummary } from '~/partials/graph-explorer/connections/centre-summary';

import {
  GraphCard,
  generateGraphCardResponse,
  kindChipLabel,
  placeNodes,
  responsesSoFar,
  shownVerdict,
} from './graph-card-image';
import type { GraphFilter } from './graph-filter';
import type { GraphCardData, GraphCardNode } from './server/graph-card-data';

const panel = vi.hoisted(() => ({ summary: undefined as unknown }));
vi.mock('~/core/graph-explorer/use-graph-explorer', () => ({
  useTopicClaimsSummary: () => ({ isLoading: false, isError: false, data: panel.summary }),
}));

const text = (element: React.ReactElement) =>
  renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

const node = (
  id: string,
  kind: GraphCardNode['kind'],
  name: string,
  extra: Partial<GraphCardNode> = {}
): GraphCardNode => ({
  id,
  name,
  kind,
  label: kind === 'story' ? 'News story' : kind === 'src' ? 'Article' : kind === 'event' ? 'News event' : null,
  image: null,
  counts: kind === 'claim' ? { positive: 0, negative: 0 } : null,
  ...extra,
});

const NEIGHBOURS: GraphCardNode[] = [
  node('t1', 'topic', 'Israel-Lebanon conflict'),
  node('e1', 'ent', 'World Central Kitchen'),
  node('c1', 'claim', "Hamas's use of civilian buildings and infrastructure for military purposes", {
    counts: { positive: 4, negative: 1 },
  }),
  node('s1', 'story', 'Donald Trump announces Hamas disarmament agreement'),
  node('v1', 'event', 'An Israeli strike in Gaza City killed Jamal Abu Saeed, whom the IDF said'),
  node('a1', 'src', 'UN SRSG Pramila Patten Mission Report on Conflict-Related Sexual Violence'),
];

const base = (centre: Partial<GraphCardData['centre']>, rest: Partial<GraphCardData> = {}): GraphCardData => ({
  centre: {
    id: 'c',
    name: 'Israel-Gaza war',
    kind: 'topic',
    label: null,
    description: 'The war between Israel and Hamas that began with the October 7, 2023 attacks.',
    typeLabel: 'Topic',
    image: null,
    counts: null,
    ...centre,
  },
  topic: { id: 'c', name: 'Israel-Gaza war' },
  isTopicCentre: true,
  neighbours: NEIGHBOURS,
  kindCounts: [
    { kind: 'topic', n: 11, more: true },
    { kind: 'src', n: 1, more: false },
  ],
  summary: null,
  degraded: false,
  ...rest,
});

const claim = (positive: number, negative: number) =>
  base(
    {
      id: 'q',
      kind: 'claim',
      typeLabel: 'Claim',
      description: null,
      name: "Israel's military campaign and siege restrictions in Gaza meet the legal threshold of genocide under the Genocide Convention",
      counts: { positive, negative },
    },
    { isTopicCentre: false }
  );

const SHAPES: Record<string, GraphCardData> = {
  topic: base(
    {},
    {
      summary: {
        claims: [
          { id: 'a', name: 'a', spaceId: 's', positive: 5, negative: 0, band: 'agreed' },
          { id: 'b', name: 'b', spaceId: 's', positive: 2, negative: 2, band: 'contested' },
          { id: 'd', name: 'd', spaceId: 's', positive: 0, negative: 3, band: 'rejected' },
          { id: 'e', name: 'e', spaceId: 's', positive: 1, negative: 0, band: 'agreed' },
        ],
        truncated: false,
      },
    }
  ),
  person: base(
    {
      name: 'Isaac Herzog',
      kind: 'ent',
      typeLabel: 'Person',
      description: 'Israeli politician, president since 2021.',
    },
    { isTopicCentre: false, neighbours: NEIGHBOURS.slice(3) }
  ),
  claim: claim(5, 5),
  claimFew: claim(2, 0),
  claimNone: claim(0, 0),
  sparse: base(
    { name: 'World Central Kitchen', kind: 'ent', typeLabel: 'Organization' },
    { neighbours: NEIGHBOURS.slice(0, 1), isTopicCentre: false }
  ),
  empty: base({ name: 'Israel-Lebanon conflict' }, { neighbours: [], kindCounts: [] }),
};

describe('graph share card', () => {
  it.each(Object.keys(SHAPES))('renders %s to a 1200×630 JPEG', async name => {
    const response = await generateGraphCardResponse(SHAPES[name]);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    const buffer = Buffer.from(await response.arrayBuffer());
    const meta = await sharp(buffer).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 630]);
    if (process.env.GRAPH_CARD_DUMP) writeFileSync(join(process.env.GRAPH_CARD_DUMP, `${name}.jpg`), buffer);
  });

  it('keeps every node inside the frame with a margin', () => {
    for (const placed of placeNodes(NEIGHBOURS)) {
      expect(placed.left).toBeGreaterThanOrEqual(24);
      expect(placed.top).toBeGreaterThanOrEqual(24);
      expect(placed.left + placed.w).toBeLessThanOrEqual(1200 - 24);
      expect(placed.top + placed.h).toBeLessThanOrEqual(630 - 24);
    }
  });

  it('shows a percent and band only from 3 responses, on each band boundary', () => {
    expect(shownVerdict({ positive: 2, negative: 0 })).toBeNull();
    expect(shownVerdict({ positive: 0, negative: 0 })).toBeNull();
    expect(shownVerdict({ positive: 65, negative: 35 })).toEqual({ band: 'agreed', percent: 65 });
    expect(shownVerdict({ positive: 64, negative: 36 })).toEqual({ band: 'contested', percent: 64 });
    expect(shownVerdict({ positive: 35, negative: 65 })).toEqual({ band: 'contested', percent: 35 });
    expect(shownVerdict({ positive: 34, negative: 66 })).toEqual({ band: 'rejected', percent: 34 });
    expect(responsesSoFar(1)).toBe('1 response so far');
    expect(responsesSoFar(2)).toBe('2 responses so far');
  });

  it('writes chips singular only for exactly one', () => {
    expect(kindChipLabel({ kind: 'src', n: 1, more: false })).toBe('1 source');
    expect(kindChipLabel({ kind: 'src', n: 1, more: true })).toBe('1+ sources');
    expect(kindChipLabel({ kind: 'ent', n: 8, more: true })).toBe('8+ people and groups');
  });
});

describe('the panel and the card', () => {
  const both = (data: GraphCardData) => {
    panel.summary = data.summary;
    return {
      card: text(<GraphCard data={data} />),
      panel: text(
        <TopicClaimsSummary topicId="t" filter={{} as GraphFilter} topicSpaceId={null} onOpenClaim={() => {}} />
      ),
    };
  };

  it('state the same bands, with the count of claims with 3+ responses on the card only', () => {
    const { card, panel: shown } = both(SHAPES.topic);
    expect(card).toContain('3 claims with 3+ responses');
    expect(shown).not.toContain('with 3+ responses');
    for (const [label, n] of [
      ['widely agreed', 1],
      ['contested', 1],
      ['widely rejected', 1],
    ] as const) {
      expect(card).toContain(`${n} ${label}`);
      expect(shown.toLowerCase()).toMatch(new RegExp(`${label} ${n}\\b`));
    }
  });

  it('say only how many claims have responses when none has 3, with no bands', () => {
    const sparse = base(
      {},
      {
        summary: {
          claims: [
            { id: 'a', name: 'a', spaceId: 's', positive: 2, negative: 0, band: 'agreed' },
            { id: 'b', name: 'b', spaceId: 's', positive: 1, negative: 1, band: 'contested' },
          ],
          truncated: false,
        },
      }
    );
    const { card, panel: shown } = both(sparse);
    expect(card).toContain('2 claims have responses so far');
    expect(shown).toContain('2 claims have responses so far');
    expect(card).not.toMatch(/widely agreed/i);
    expect(shown).not.toMatch(/widely agreed/i);
    // Most responses keeps its count, without a percent under 3.
    expect(shown).toContain('2 responses');
    expect(shown).not.toContain('100% agree');
  });
});
