import { describe, expect, it } from 'vitest';

import {
  DESKTOP_LAYOUT,
  FOCAL_LENGTH,
  PHONE_CARD_HALF_WIDTH,
  PHONE_LAYOUT,
  type Vec3,
  easeInOutCubic,
  fitDistance,
  fitView,
  hash01,
  project,
  simulateLayout,
} from './layout-3d';

const ids = Array.from({ length: 41 }, (_, i) => `n${i}`);
const links = ids
  .slice(1)
  .map((id, i) => ({ a: i < 14 ? 'n0' : `n${1 + (i % 14)}`, b: id, hop: (i < 14 ? 1 : 2) as 1 | 2 }));

describe('simulateLayout', () => {
  it('is deterministic and pins the centre at the origin', () => {
    const run = () => simulateLayout({ ids, links, centreId: 'n0', previous: new Map(), settings: DESKTOP_LAYOUT });
    const first = run();
    expect(first).toEqual(run());
    expect(first.get('n0')).toEqual([0, 0, 0]);
  });

  it('puts hop-1 nodes near their rest length from the centre, nearer on phone', () => {
    const median = (settings: typeof DESKTOP_LAYOUT) => {
      const p = simulateLayout({ ids, links, centreId: 'n0', previous: new Map(), settings });
      const d = ids
        .slice(1, 15)
        .map(id => Math.hypot(...p.get(id)!))
        .sort((a, b) => a - b);
      return d[7];
    };
    const desktop = median(DESKTOP_LAYOUT);
    expect(desktop).toBeGreaterThan(200);
    expect(desktop).toBeLessThan(900);
    expect(median(PHONE_LAYOUT)).toBeLessThan(desktop);
  });

  it('starts a node already on screen where it is, recentred on the new centre', () => {
    const previous = new Map<string, Vec3>([
      ['n0', [100, 0, 0]],
      ['n1', [500, 0, 0]],
    ]);
    const p = simulateLayout({
      ids: ['n1', 'n0'],
      links: [{ a: 'n1', b: 'n0', hop: 1 }],
      centreId: 'n1',
      previous,
      settings: { ...DESKTOP_LAYOUT, iterations: 0 },
    });
    expect(p.get('n0')).toEqual([-400, 0, 0]);
  });

  it('separates nodes that start at the same point', () => {
    // A selection that lands before the previous one has moved starts its new nodes on their parent.
    const stacked = simulateLayout({
      ids: ['c', 'a', 'b'],
      links: [
        { a: 'c', b: 'a', hop: 1 },
        { a: 'c', b: 'b', hop: 1 },
      ],
      centreId: 'c',
      previous: new Map([
        ['c', [0, 0, 0]],
        ['a', [0, 0, 0]],
        ['b', [0, 0, 0]],
      ]),
      settings: PHONE_LAYOUT,
    });
    const [a, b] = [stacked.get('a')!, stacked.get('b')!];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(100);
  });

  it('lays out the design’s largest graph quickly', () => {
    const start = performance.now();
    simulateLayout({ ids, links, centreId: 'n0', previous: new Map(), settings: DESKTOP_LAYOUT });
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('project', () => {
  it('draws the origin at the middle and shrinks with distance', () => {
    const view = { yaw: 0, pitch: 0, distance: 1000, width: 800, height: 600 };
    expect(project([0, 0, 0], view)).toMatchObject({ x: 400, y: 300 });
    expect(project([0, 0, 500], view).scale).toBeLessThan(project([0, 0, -500], view).scale);
  });

  it('stretches vertically on portrait screens', () => {
    const portrait = { yaw: 0, pitch: 0, distance: 1000, width: 390, height: 800 };
    expect(project([0, 100, 0], portrait).y - 400).toBeCloseTo(90 * 1.45);
  });
});

describe('helpers', () => {
  it('fits distance within the design’s bounds', () => {
    expect(fitDistance([[0, 0, 0]], 1280, 860, false)).toBe(700);
    expect(fitDistance([[5000, 5000, 0]], 390, 844, true)).toBe(2600);
  });

  it('keeps desktop and tablet fits as they were', () => {
    const points: Vec3[] = [
      [0, 0, 0],
      [300, 40, 80],
      [-260, -90, 120],
      [120, 200, -200],
      [-50, 310, 60],
    ];
    for (const [w, h] of [
      [1440, 900],
      [1024, 768],
      [600, 900],
    ]) {
      const stretch = h > w * 1.1 ? 1.45 : 1;
      const p85 = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length * 0.85)];
      const fx = p85(points.map(p => Math.hypot(p[0], p[2]) + 100));
      const fy = p85(points.map(p => Math.hypot(p[1], p[2]) * stretch + 50));
      const expected = Math.max(
        700,
        Math.min(2600, Math.max((fx * 900) / Math.max(140, w / 2 - 8), (fy * 900) / Math.max(140, h / 2 - 16)))
      );
      expect(fitDistance(points, w, h, false)).toBeCloseTo(expected);
    }
  });

  it('stretches a portrait phone map into the height the width leaves, within bounds', () => {
    // A flat band: wide in x, shallow in y.
    const band: Vec3[] = [
      [0, 0, 0],
      [250, 20, 0],
      [-240, -30, 0],
      [200, 40, 60],
      [-180, -50, -40],
    ];
    const { distance, stretch } = fitView(band, 390, 844, true);
    expect(stretch).toBe(2.2);
    expect(distance).toBe(fitDistance(band, 390, 844, true));
    // A tall spread needs no extra stretch, and the height still fits with a card's margin.
    const tall: Vec3[] = [
      [0, 0, 0],
      [60, 300, 0],
      [-50, -320, 0],
      [40, 280, 20],
      [-30, -260, 10],
    ];
    const fitted = fitView(tall, 390, 844, true);
    expect(fitted.stretch).toBe(1.45);
    expect(844 / 2 + ((300 * 900) / fitted.distance) * fitted.stretch + 40).toBeLessThanOrEqual(844);
    // Landscape phone and desktop keep the screen's stretch.
    expect(fitView(band, 599, 400, true).stretch).toBe(1);
    expect(fitView(band, 1440, 900, false).stretch).toBe(1);
    expect(fitView(band, 768, 1024, false).stretch).toBe(1.45);
  });

  it('projects with a given stretch, or the screen stretch when none is given', () => {
    const view = { yaw: 0, pitch: 0, distance: 900, width: 390, height: 844 };
    expect(project([0, 100, 0], view).y).toBeCloseTo(422 + 145);
    expect(project([0, 100, 0], { ...view, stretch: 2 }).y).toBeCloseTo(422 + 200);
  });

  it('on phone, keeps a full card on screen beside the 85th-percentile neighbour at the fit zoom', () => {
    const points: Vec3[] = [
      [0, 0, 0],
      [250, 0, 0],
      [-240, 0, 0],
      [0, 0, 230],
      [180, 0, -170],
    ];
    for (const [w, h] of [
      [390, 844],
      [360, 780],
    ]) {
      const fit = fitDistance(points, w, h, true);
      const x = (250 * FOCAL_LENGTH) / fit;
      expect(w / 2 + x + PHONE_CARD_HALF_WIDTH).toBeLessThanOrEqual(w);
    }
  });

  it('hashes to [0, 1) and eases from 0 to 1', () => {
    expect(hash01('a')).toBe(hash01('a'));
    expect(hash01('a')).toBeGreaterThanOrEqual(0);
    expect(hash01('a')).toBeLessThan(1);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });
});
