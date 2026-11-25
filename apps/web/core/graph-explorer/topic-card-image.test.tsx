// @vitest-environment node
import * as React from 'react';

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import type { GraphCardData, GraphCardNode } from './server/graph-card-data';
import {
  TITLE_MAX_LINES,
  TITLE_MAX_PX,
  TITLE_MIN_PX,
  TOPIC_CARD_H,
  TOPIC_CARD_W,
  TopicCard,
  fitTopicTitle,
  generateTopicCardResponse,
  placeTopicNodes,
  textBlockTop,
} from './topic-card-image';
import { TOPIC_HUB, assignTopicSlots } from './topic-card-slots';

const text = (element: React.ReactElement) =>
  renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

const node = (id: string, kind: GraphCardNode['kind'], name: string): GraphCardNode => ({
  id,
  name,
  kind,
  label: kind === 'story' ? 'News story' : kind === 'src' ? 'Article' : kind === 'event' ? 'News event' : null,
  image: null,
  counts: kind === 'claim' ? { positive: 3, negative: 1 } : null,
});

const NEIGHBOURS: GraphCardNode[] = [
  node('t1', 'topic', 'West Bank'),
  node('e1', 'ent', 'Donald Trump'),
  node('s1', 'story', 'Israeli troops fail to disperse settlers besieging Palestinian families'),
  node('v1', 'event', 'A Turkish court issued an indictment against Benjamin Netanyahu'),
  node('a1', 'src', 'Trump opposes Israel’s West Bank annexation, official says, as outcry grows'),
  node('e2', 'ent', 'Mahmoud Abbas'),
];

const data = (centre: Partial<GraphCardData['centre']> = {}, rest: Partial<GraphCardData> = {}): GraphCardData => ({
  centre: {
    id: 'c',
    name: 'Israel-Palestine Conflict',
    kind: 'topic',
    label: null,
    description: 'A description the card never draws.',
    typeLabel: 'Topic',
    image: null,
    counts: null,
    ...centre,
  },
  topic: { id: 'c', name: 'Israel-Palestine Conflict' },
  isTopicCentre: true,
  neighbours: NEIGHBOURS,
  kindCounts: [],
  summary: null,
  degraded: false,
  variant: 'topic',
  ...rest,
});

const LONG = 'International Court of Justice ruling on the Israeli occupation';

const SHAPES: Record<string, GraphCardData> = {
  full: data(),
  noCover: data({ name: 'Water rights in the Jordan basin' }),
  longName: data({ name: LONG }),
  sparse: data({ name: 'Sumud flotilla' }, { neighbours: NEIGHBOURS.slice(0, 2) }),
  empty: data({ name: 'Gaza ceasefire' }, { neighbours: [] }),
};

describe('topic link preview', () => {
  it.each(Object.keys(SHAPES))('renders %s to a 1200×630 JPEG', async name => {
    const response = await generateTopicCardResponse(SHAPES[name]);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    const buffer = Buffer.from(await response.arrayBuffer());
    const meta = await sharp(buffer).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 630]);
    if (process.env.TOPIC_CARD_DUMP) writeFileSync(join(process.env.TOPIC_CARD_DUMP, `${name}.jpg`), buffer);
  });

  it('draws the label, the name and the neighbours, and never a claim or the description', () => {
    const claim = node('q1', 'claim', 'Israel is committing genocide in Gaza');
    const drawn = text(<TopicCard data={data({}, { neighbours: [claim, ...NEIGHBOURS] })} />);
    expect(drawn).toContain('Topic');
    expect(drawn).toContain('Israel-Palestine Conflict');
    expect(drawn).toContain('West Bank');
    expect(drawn).toContain('News event');
    expect(drawn).not.toContain('genocide');
    expect(drawn).not.toContain('description');
    expect(drawn).not.toMatch(/agree|responses/i);
  });
});

describe('fitTopicTitle', () => {
  it('sets a two-word name at the full size, the hyphenated word whole on line 1', () => {
    expect(fitTopicTitle('Israel-Palestine Conflict')).toEqual({
      fontSize: TITLE_MAX_PX,
      lines: ['Israel-Palestine', 'Conflict'],
    });
  });

  it('shrinks a long name to fit three lines, and never below the floor', () => {
    const fit = fitTopicTitle(LONG);
    expect(fit.fontSize).toBeLessThan(TITLE_MAX_PX);
    expect(fit.fontSize).toBeGreaterThanOrEqual(TITLE_MIN_PX);
    expect(fit.lines.length).toBeLessThanOrEqual(TITLE_MAX_LINES);
    expect(fit.lines.join(' ')).toBe(LONG);
    expect(fitTopicTitle(`${LONG} ${LONG} ${LONG}`).fontSize).toBe(TITLE_MIN_PX);
  });

  it('centres the label and title on the hub line', () => {
    expect(textBlockTop(fitTopicTitle('Israel-Palestine Conflict'))).toBe(216);
    expect(textBlockTop({ fontSize: 48, lines: ['a', 'b', 'c', 'd'] })).toBe(
      Math.round(TOPIC_HUB.y - (26 * 1.1 + 12 + 3 * 48 * 1.05) / 2)
    );
  });
});

describe('topic card layout', () => {
  it('puts content cards only in the outer slots, so none covers the hub', () => {
    const cards = ['s1', 's2', 's3', 's4', 's5'].map(id => node(id, 'story', id));
    const slots = assignTopicSlots([...cards, node('e1', 'ent', 'A'), node('t1', 'topic', 'B')]);
    expect(slots.filter(({ node }) => node.kind === 'story').map(({ slot }) => slot)).toEqual([3, 4, 5]);
    expect(slots.find(({ node }) => node.kind === 'ent')?.slot).toBe(1);
    expect(slots.find(({ node }) => node.kind === 'topic')?.slot).toBe(0);
  });

  it('never puts a topic pill right of the hub', () => {
    const topics = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => node(id, 'topic', id));
    expect(assignTopicSlots(topics).map(({ slot }) => slot)).not.toContain(2);
  });

  it('keeps every node inside the frame and clear of the hub', () => {
    const hub = { left: TOPIC_HUB.x - TOPIC_HUB.size / 2, right: TOPIC_HUB.x + TOPIC_HUB.size / 2 };
    const hubTop = TOPIC_HUB.y - TOPIC_HUB.size / 2;
    const hubBottom = TOPIC_HUB.y + TOPIC_HUB.size / 2;
    for (const placed of placeTopicNodes(NEIGHBOURS)) {
      expect(placed.left).toBeGreaterThanOrEqual(24);
      expect(placed.top).toBeGreaterThanOrEqual(24);
      expect(placed.left + placed.w).toBeLessThanOrEqual(TOPIC_CARD_W - 24);
      expect(placed.top + placed.h).toBeLessThanOrEqual(TOPIC_CARD_H - 24);
      if (placed.node.kind !== 'ent') {
        const overlapsX = placed.left < hub.right && placed.left + placed.w > hub.left;
        const overlapsY = placed.top < hubBottom && placed.top + placed.h > hubTop;
        expect(overlapsX && overlapsY).toBe(false);
      }
    }
  });
});
