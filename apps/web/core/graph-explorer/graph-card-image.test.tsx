// @vitest-environment node
import * as React from 'react';

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { GraphCard, generateGraphCardResponse, shownVerdict } from './graph-card-image';
import { CLAIM_TITLE_MAX_LINES, TITLE_MIN_PX, claimNodeLabel, fitLinkCardTitle } from './link-card-layout';
import type { GraphCardData, GraphCardNode } from './server/graph-card-data';
import { TopicCard } from './topic-card-image';

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
  degraded: false,
  variant: 'graph',
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
  topic: base({}, { neighbours: NEIGHBOURS.filter(entry => entry.kind !== 'claim') }),
  person: base(
    {
      name: 'Isaac Herzog',
      kind: 'ent',
      typeLabel: 'Person',
      description: 'Israeli politician, president since 2021.',
    },
    { isTopicCentre: false }
  ),
  claim: claim(5, 5),
  claimFew: claim(2, 0),
  claimNone: claim(0, 0),
  empty: base({ name: 'Israel-Lebanon conflict' }, { neighbours: [] }),
};

const BAND_COLORS = ['#1e824c', '#b75700', '#6833ff', 'rgba(30,130,76', 'rgba(183,87,0', 'rgba(104,51,255'];

describe('graph share card', () => {
  it.each(Object.keys(SHAPES))('renders %s to a 1200×630 JPEG', async name => {
    const response = await generateGraphCardResponse(SHAPES[name]);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    const buffer = Buffer.from(await response.arrayBuffer());
    const meta = await sharp(buffer).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 630]);
    if (process.env.GRAPH_CARD_DUMP) writeFileSync(join(process.env.GRAPH_CARD_DUMP, `${name}.jpg`), buffer);
  });

  it("labels the title with the centre's kind and draws no description, stats or tagline", () => {
    const drawn = text(<GraphCard data={SHAPES.person} />);
    expect(drawn).toContain('Person');
    expect(drawn).toContain('Isaac Herzog');
    expect(drawn).not.toContain('Israeli politician');
    expect(drawn).not.toContain('Connections');
    expect(drawn).not.toContain(' in Israel-Gaza war');
    expect(drawn).not.toMatch(/people and groups|claims with/);
  });

  it('draws a claim neighbour as a neutral card whose label carries its agree percent', () => {
    const markup = renderToStaticMarkup(<GraphCard data={SHAPES.person} />);
    expect(markup).toContain('Claim · 80% agree');
    for (const color of BAND_COLORS) expect(markup).not.toContain(color);
    expect(markup).not.toMatch(/widely agreed|contested|widely rejected/i);
  });

  it("puts a claim centre's agree percent in the hub, and its count until it has 3 responses", () => {
    expect(text(<GraphCard data={SHAPES.claim} />)).toMatch(/50% agree/);
    expect(text(<GraphCard data={SHAPES.claimFew} />)).toContain('2 responses');
    expect(text(<GraphCard data={SHAPES.claimNone} />)).toContain('No votes yet');
    for (const shape of [SHAPES.claim, SHAPES.claimFew, SHAPES.claimNone]) {
      const markup = renderToStaticMarkup(<GraphCard data={shape} />);
      for (const color of BAND_COLORS) expect(markup).not.toContain(color);
    }
  });

  it('labels a claim with a percent only from 3 responses', () => {
    expect(claimNodeLabel({ positive: 2, negative: 0 })).toBe('Claim');
    expect(claimNodeLabel(null)).toBe('Claim');
    expect(claimNodeLabel({ positive: 3, negative: 1 })).toBe('Claim · 75% agree');
    expect(shownVerdict({ positive: 65, negative: 35 })).toEqual({ band: 'agreed', percent: 65 });
    expect(shownVerdict({ positive: 34, negative: 66 })).toEqual({ band: 'rejected', percent: 34 });
  });

  it('gives a long claim up to five lines before it shrinks to the floor', () => {
    const name = SHAPES.claim.centre.name;
    expect(fitLinkCardTitle(name).lines.length).toBeLessThanOrEqual(3);
    const fit = fitLinkCardTitle(name, CLAIM_TITLE_MAX_LINES);
    expect(fit.lines.length).toBeGreaterThan(3);
    expect(fit.lines.length).toBeLessThanOrEqual(CLAIM_TITLE_MAX_LINES);
    expect(fit.fontSize).toBeGreaterThanOrEqual(TITLE_MIN_PX);
    expect(fit.lines.join(' ')).toBe(name);
    expect(renderToStaticMarkup(<GraphCard data={SHAPES.claim} />)).toMatch(/line-clamp:\s?5/);
    expect(renderToStaticMarkup(<GraphCard data={SHAPES.person} />)).not.toMatch(/line-clamp:\s?5/);
  });

  it('draws a topic centre exactly as the Topic link preview does: one shared layout', () => {
    expect(renderToStaticMarkup(<GraphCard data={SHAPES.topic} />)).toBe(
      renderToStaticMarkup(<TopicCard data={{ ...SHAPES.topic, variant: 'topic' }} />)
    );
  });
});
