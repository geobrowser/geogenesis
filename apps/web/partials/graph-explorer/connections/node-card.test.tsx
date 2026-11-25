import { cleanup, fireEvent, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import { GRAPH_KIND_TYPE_IDS, type GraphKind } from '~/core/graph-explorer/graph-kinds';

import { CENTRE_RING, NodeCard, farMarkerClass, isFarNode, sourceEyebrow } from './node-card';

const summary = vi.hoisted(() => ({ positive: 8, negative: 2 }));
vi.mock('~/core/claims/browse/claim-response-summary', () => ({
  useClaimResponseSummary: () => ({
    positive: summary.positive,
    negative: summary.negative,
    percent: Math.round((100 * summary.positive) / (summary.positive + summary.negative)),
    isLoading: false,
    hasCounts: true,
  }),
}));

afterEach(cleanup);

const REPORT = '79e68c1742ff427ea52ada9323cf89e0';

const node = (kind: GraphKind, extra: Partial<GraphNode> = {}): GraphNode => ({
  id: '1'.repeat(32),
  name: `A ${kind}`,
  kind,
  spaceIds: [],
  namedSpaceIds: [],
  placedSpaceIds: [],
  types: [],
  image: null,
  typeRank: 0,
  date: null,
  agrees: 0,
  disagrees: 0,
  ...extra,
});

function card(entry: GraphNode, hop: 0 | 1 | 2, isCentre = hop === 0) {
  return render(<NodeCard node={entry} hop={hop} isCentre={isCentre} phone={false} claimSpaceId={'s'.repeat(32)} />)
    .container;
}

const centreRing = CENTRE_RING;

describe('NodeCard topics', () => {
  it('draws a topic around the centre as a small gray pill, and the centre topic as the white one', () => {
    const around = card(node('topic'), 1).querySelector('[data-label]')!;
    expect(around.className).toContain('bg-grey-05');
    expect(around.className).not.toContain('bg-white');
    expect(around.className).not.toContain('44px');
    const centre = card(node('topic'), 0).querySelector('[data-label]')!;
    expect(centre.className).toContain('bg-white');
    expect(centre.className).toContain(centreRing);
  });
});

describe('NodeCard centre mark', () => {
  it.each(['topic', 'ent', 'claim', 'story', 'event', 'src', 'case', 'other'] as const)('rings a %s centre', kind => {
    const container = card(node(kind), 0);
    expect(container.innerHTML).toContain(centreRing);
    expect(card(node(kind), 1).innerHTML).not.toContain(centreRing);
  });
});

describe('NodeCard far nodes', () => {
  it.each(['topic', 'ent', 'claim', 'story', 'event', 'src', 'case', 'other'] as const)(
    'draws a far %s as a marker with no text in view',
    kind => {
      const container = card(node(kind), 2);
      expect(container.querySelector('[data-label]')).toBeNull();
      // The name is there only for hover and focus, hidden until then.
      const visible = [...container.querySelectorAll('span')].filter(
        span => span.textContent && !span.closest('.hidden') && span.children.length === 0
      );
      expect(visible.map(span => span.textContent)).toEqual([]);
    }
  );

  it.each(['topic', 'ent', 'claim', 'story', 'src'] as const)(
    'lets a hop-1 %s swap its text for the marker while the map draws it too small (data-far)',
    kind => {
      const container = card(node(kind), 1);
      expect(container.innerHTML).toContain('group-data-[far]:hidden');
      expect(container.innerHTML).toContain('group-data-[far]:contents');
      expect(card(node(kind), 0).innerHTML).not.toContain('group-data-[far]');
    }
  );

  it("colors a far claim's marker by its band", () => {
    const marker = card(node('claim'), 2).querySelector('[data-far-marker] > [aria-hidden]')!;
    expect(marker.className).toContain('bg-[#1e824c]');
  });

  it('keeps the label of a hop-2 node when it is the centre', () => {
    expect(card(node('claim'), 2, true).querySelector('[data-label]')).not.toBeNull();
    expect(isFarNode(2, true)).toBe(false);
    expect(isFarNode(1, false)).toBe(false);
    expect(isFarNode(2, false)).toBe(true);
  });

  it('gives each kind its own marker color, hollow for a claim with no band', () => {
    expect(farMarkerClass('claim', 'contested')).toContain('bg-[#b75700]');
    expect(farMarkerClass('claim', null)).toContain('border-white/50');
    expect(farMarkerClass('topic', null)).toContain('bg-grey-03');
    expect(farMarkerClass('src', null)).toContain('border-dashed');
    expect(new Set((['story', 'event', 'case'] as const).map(kind => farMarkerClass(kind, null))).size).toBe(3);
  });
});

describe('source cards', () => {
  const report = node('src', {
    name: 'How Gaza’s dead are counted',
    types: [{ id: REPORT, name: 'Report' }],
    publisher: { id: 'c'.repeat(32), name: 'BBC Verify', image: null },
    date: '2025-03-04T00:00:00Z',
  });

  it('reads type · outlet · month, each only when known', () => {
    expect(GRAPH_KIND_TYPE_IDS.src).toContain(REPORT);
    expect(sourceEyebrow(report, null)).toBe('Report · BBC Verify · Mar 2025');
    expect(sourceEyebrow({ ...report, publisher: null }, null)).toBe('Report · Mar 2025');
    expect(sourceEyebrow({ ...report, date: 'not a date' }, null)).toBe('Report · BBC Verify');
    // An outlet that is the source's own name says nothing new.
    expect(sourceEyebrow({ ...report, publisher: { id: 'c'.repeat(32), name: report.name!, image: null } }, null)).toBe(
      'Report · Mar 2025'
    );
    expect(sourceEyebrow({ ...report, types: [], publisher: null, date: null }, null)).toBeNull();
  });

  it("drops the outlet around its own publisher, where every card would repeat the centre's name", () => {
    expect(sourceEyebrow(report, 'c'.repeat(32))).toBe('Report · Mar 2025');
    expect(sourceEyebrow(report, 'd'.repeat(32))).toBe('Report · BBC Verify · Mar 2025');
    const around = render(
      <NodeCard node={report} hop={1} isCentre={false} phone={false} claimSpaceId={null} centreId={'c'.repeat(32)} />
    ).container;
    expect(around.querySelector('[data-source-card]')!.textContent).not.toContain('BBC Verify');
  });

  it('draws a source with a dashed edge and its eyebrow, unlike a claim', () => {
    const source = card(report, 1).querySelector('[data-source-card]')!;
    expect(source.className).toContain('border-dashed');
    expect(source.textContent).toContain('Report · BBC Verify · Mar 2025');
    expect(card(node('claim'), 1).querySelector('[data-label]')!.className).not.toContain('border-dashed');
    expect(card(node('story'), 1).querySelector('[data-label]')!.className).not.toContain('border-dashed');
  });
});

describe('entities without a picture', () => {
  const PHOTO = 'https://example.com/portrait.png';
  const PERSON = GRAPH_KIND_TYPE_IDS.ent[0]!;
  const person = (extra: Partial<GraphNode> = {}) =>
    node('ent', { name: 'Talia Levin', types: [{ id: PERSON, name: 'Person' }], ...extra });
  /** Text in view: any letter circle would show up here as a lone capital. */
  const visibleText = (container: HTMLElement) =>
    [...container.querySelectorAll('span')]
      .filter(span => span.textContent && !span.closest('.hidden') && span.children.length === 0)
      .map(span => span.textContent);

  it.each([
    ['a person with no photo', person()],
    ['an untyped entity', node('other', { name: 'Talia Levin' })],
  ])('draws %s as a name card, not a letter circle, at the centre and around it', (_, entry) => {
    for (const [hop, isCentre] of [
      [0, true],
      [1, false],
    ] as const) {
      const container = card(entry, hop, isCentre);
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('[data-anchor]')).toBeNull();
      const named = container.querySelector('[data-name-card]')!;
      expect(named).not.toBeNull();
      expect(named.className).toContain('rounded-xl');
      expect(named.className.includes(CENTRE_RING)).toBe(isCentre);
      expect(visibleText(container)).not.toContain('T');
      expect(visibleText(container)).toContain('Talia Levin');
    }
  });

  it('heads a typed name card with its type, like other cards', () => {
    expect(visibleText(card(person(), 1))).toEqual(['Person', 'Talia Levin']);
  });

  it('keeps a photo and name label for an entity with a picture', () => {
    const container = card(person({ image: PHOTO }), 1);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(PHOTO);
    expect(container.querySelector('[data-anchor]')).not.toBeNull();
    expect(container.querySelector('[data-name-card]')).toBeNull();
    expect(container.querySelector('[data-label]')?.textContent).toBe('Talia Levin');
  });

  it.each([0, 1] as const)('falls back to the name card when the picture fails to load (hop %s)', hop => {
    const container = card(person({ image: PHOTO }), hop);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-name-card]')?.textContent).toContain('Talia Levin');
    expect(visibleText(container)).not.toContain('T');
  });

  it('lets a hop-1 name card swap to its marker while drawn too small (data-far)', () => {
    const container = card(person(), 1);
    expect(container.querySelector('.group-data-\\[far\\]\\:hidden [data-name-card]')).not.toBeNull();
    expect(container.querySelector('.group-data-\\[far\\]\\:contents [data-far-marker]')).not.toBeNull();
  });

  it('draws a far entity with no picture as a neutral dot, and one with a picture as its small photo', () => {
    const dot = card(person(), 2).querySelector('[data-far-marker] > [aria-hidden]')!;
    expect(dot.className).toContain('rounded-full');
    expect(dot.className).toContain('bg-grey-03');
    expect(farMarkerClass('other', null)).toBe(farMarkerClass('ent', null));
    const photo = card(person({ image: PHOTO }), 2);
    expect(photo.querySelector('img')).not.toBeNull();
    expect(photo.querySelector('[data-far-marker]')).toBeNull();
  });

  it('turns a far photo that fails to load into the dot', () => {
    const container = card(person({ image: PHOTO }), 2);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-far-marker]')).not.toBeNull();
  });
});
