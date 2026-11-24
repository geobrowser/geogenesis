import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { captureSafely } from '~/core/analytics-capture-safely';
import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import { GraphAnalyticsProvider, startGraphExplorerSession } from '~/core/graph-explorer/graph-explorer-analytics';
import type { GraphKind } from '~/core/graph-explorer/graph-kinds';
import type { GraphSelection } from '~/core/graph-explorer/select-graph';
import type { SelectedNode } from '~/core/graph-explorer/select-graph';
import { SKELETON_SELECTION, isSkeletonNode } from '~/core/graph-explorer/skeleton-graph';

import { ConnectionsCanvas, clearance, nodeScale, overlapShare, overlaps, settlePushes } from './connections-canvas';
import { GraphSearch, searchNodes } from './graph-search';
import { GraphTopBar } from './graph-top-bar';

const motion = vi.hoisted(() => ({ reduce: false }));
/** IntersectionObserver callbacks, so a test can scroll the stage off-screen. */
const sight = vi.hoisted(() => ({ callbacks: [] as IntersectionObserverCallback[] }));
/** ResizeObserver callbacks, so a test can grow a card. */
const resized = vi.hoisted(() => ({
  callbacks: [] as ResizeObserverCallback[],
  observed: [] as Array<{ callback: ResizeObserverCallback; target: Element }>,
}));
/** Every fit asked for, and the distance the last frame projected at. */
const view = vi.hoisted(() => ({ fits: [] as Array<{ width: number; height: number; fit: number }>, distance: 0 }));
vi.mock('~/core/graph-explorer/layout-3d', async importOriginal => {
  const real = await importOriginal<typeof import('~/core/graph-explorer/layout-3d')>();
  return {
    ...real,
    fitDistance: (...args: Parameters<typeof real.fitDistance>) => {
      const fit = real.fitDistance(...args);
      view.fits.push({ width: args[1], height: args[2], fit });
      return fit;
    },
    project: (...args: Parameters<typeof real.project>) => {
      view.distance = args[1].distance;
      return real.project(...args);
    },
  };
});
vi.mock('~/core/analytics-capture-safely', () => ({ captureSafely: vi.fn() }));
vi.mock('framer-motion', () => ({ useReducedMotion: () => motion.reduce }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));

const node = (n: number, kind: GraphKind, name = `Node ${n}`): GraphNode => ({
  id: n.toString(16).padStart(32, '0'),
  name,
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
});

const centre = node(1, 'topic', 'Centre');
const person = node(2, 'ent', 'Isaac Herzog');
const selection: GraphSelection = {
  nodes: [
    { node: centre, hop: 0, parentId: null },
    { node: person, hop: 1, parentId: centre.id },
  ],
  links: [
    {
      hop: 1,
      edge: {
        id: 'e',
        fromId: centre.id,
        toId: person.id,
        propertyId: 'p',
        propertyName: 'Related people',
        spaceId: 's',
      },
    },
  ],
};

let frames: FrameRequestCallback[] = [];
let now = 0;

beforeAll(() => {
  globalThis.IntersectionObserver = class {
    constructor(private callback: IntersectionObserverCallback) {
      sight.callbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
  globalThis.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {
      resized.callbacks.push(callback);
    }
    observe(target: Element) {
      resized.observed.push({ callback: this.callback, target });
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  // jsdom has no 2D canvas; every drawing call is a no-op.
  const context = new Proxy({}, { get: (_, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => {}) });
  HTMLCanvasElement.prototype.getContext = (() => context) as never;
});

beforeEach(() => {
  sight.callbacks = [];
  resized.callbacks = [];
  resized.observed = [];
  view.fits = [];
  frames = [];
  now = 0;
  motion.reduce = false;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Runs the animation loop to `until` ms, one frame per 16ms. */
function runFrames(until: number) {
  act(() => {
    while (now < until) {
      now += 16;
      const pending = frames;
      frames = [];
      pending.forEach(callback => callback(now));
    }
  });
}

function Canvas({ onSelect = vi.fn() }: { onSelect?: (node: GraphNode) => void }) {
  return (
    <ConnectionsCanvas
      selection={selection}
      phone={false}
      onSelect={onSelect}
      renderNode={entry => entry.node.name}
      labelFor={() => 'label'}
    />
  );
}

describe('ConnectionsCanvas', () => {
  it('re-centres on a click', () => {
    const onSelect = vi.fn();
    render(<Canvas onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Isaac Herzog' }));
    expect(onSelect).toHaveBeenCalledWith(person);
  });

  it('does not treat the click that ends a drag as a click', () => {
    const onSelect = vi.fn();
    render(<Canvas onSelect={onSelect} />);
    const target = screen.getByRole('button', { name: 'Isaac Herzog' });
    fireEvent.pointerDown(target, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 160, clientY: 110 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 160, clientY: 110 });
    fireEvent.click(target);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('reports one rotate per centre for a long drag, and one zoom per centre for the buttons', () => {
    const session = startGraphExplorerSession({ entityId: 'c', topicId: 't', spaceId: null, trailDepth: 0 });
    session.opened('ready', { layout: 'desktop', trailDepth: 0 });
    render(
      <GraphAnalyticsProvider value={session}>
        <Canvas />
      </GraphAnalyticsProvider>
    );
    const target = screen.getByRole('button', { name: 'Isaac Herzog' });
    fireEvent.pointerDown(target, { pointerId: 1, clientX: 100, clientY: 100 });
    for (let x = 110; x < 600; x += 10) fireEvent.pointerMove(window, { pointerId: 1, clientX: x, clientY: 110 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 600, clientY: 110 });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    const interactions = vi
      .mocked(captureSafely)
      .mock.calls.filter(([name]) => name === 'graph_explorer_interacted')
      .map(([, props]) => [props?.interaction, props?.value]);
    expect(interactions).toEqual([
      ['rotate', undefined],
      ['zoom', 'buttons'],
    ]);
  });

  it('turns on its own when idle, but not under reduced motion', () => {
    const transformAfterIdle = () => {
      render(<Canvas />);
      const target = screen.getByRole('button', { name: 'Isaac Herzog' });
      runFrames(3000);
      const before = target.style.transform;
      runFrames(4000);
      cleanup();
      return before !== '' && before !== target.style.transform;
    };
    expect(transformAfterIdle()).toBe(true);
    motion.reduce = true;
    now = 0;
    expect(transformAfterIdle()).toBe(false);
  });

  it('sleeps once nothing moves, and wakes on input', () => {
    motion.reduce = true;
    render(<Canvas />);
    runFrames(1200);
    expect(frames).toHaveLength(0);
    fireEvent.keyDown(screen.getByTestId('connections-stage'), { key: 'ArrowLeft' });
    expect(frames).toHaveLength(1);
  });

  it('wakes when a card resizes after the loop slept', () => {
    motion.reduce = true;
    render(<Canvas />);
    runFrames(1200);
    expect(frames).toHaveLength(0);
    const card = screen.getByRole('button', { name: 'Isaac Herzog' });
    // The card observer is created first, as node refs attach before the stage's effect runs.
    act(() => resized.callbacks[0]([{ target: card } as never], {} as never));
    expect(frames).toHaveLength(1);
  });

  it('starts the idle spin for a selection made long after page load', () => {
    now = 100_000;
    render(<Canvas />);
    const target = screen.getByRole('button', { name: 'Isaac Herzog' });
    runFrames(103_000);
    const before = target.style.transform;
    runFrames(106_000);
    expect(before).not.toBe('');
    expect(target.style.transform).not.toBe(before);
  });

  it('fits the measured stage, refits on resize, and leaves a manual zoom alone', () => {
    motion.reduce = true;
    const size = { width: 390, height: 600 };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ ...size, x: 0, y: 0, top: 0, left: 0, right: size.width, bottom: size.height }) as DOMRect
    );
    render(<Canvas />);
    runFrames(100);
    expect(view.fits.at(-1)).toMatchObject({ width: 390, height: 600 });
    expect(view.distance).toBe(view.fits.at(-1)!.fit);

    const stage = screen.getByTestId('connections-stage');
    const resizeStage = (width: number, height: number) => {
      Object.assign(size, { width, height });
      act(() =>
        resized.observed
          .filter(entry => entry.target === stage)
          .forEach(entry => entry.callback([{ target: stage } as never], {} as never))
      );
      runFrames(now + 100);
    };
    resizeStage(390, 844);
    expect(view.fits.at(-1)).toMatchObject({ width: 390, height: 844 });
    expect(view.distance).toBe(view.fits.at(-1)!.fit);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    runFrames(now + 100);
    const zoomed = view.distance;
    resizeStage(390, 600);
    expect(view.distance).toBe(zoomed);
  });

  it('sleeps after the idle spin has run its course', () => {
    render(<Canvas />);
    runFrames(2600 + 45_000 + 500);
    expect(frames).toHaveLength(0);
  });

  it('stops while the stage is off-screen and starts again when it is back', () => {
    render(<Canvas />);
    runFrames(100);
    expect(frames).toHaveLength(1);
    act(() =>
      sight.callbacks.forEach(callback =>
        callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as never)
      )
    );
    frames = [];
    runFrames(200);
    expect(frames).toHaveLength(0);
    act(() =>
      sight.callbacks.forEach(callback =>
        callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as never)
      )
    );
    expect(frames).toHaveLength(1);
  });

  it('moves nodes to their places at once under reduced motion', () => {
    motion.reduce = true;
    render(<Canvas />);
    const target = screen.getByRole('button', { name: 'Isaac Herzog' });
    runFrames(16);
    const first = target.style.transform;
    runFrames(1200);
    expect(target.style.transform).toBe(first);
  });
});

describe('ConnectionsCanvas skeleton', () => {
  const skeleton = SKELETON_SELECTION.desktop;
  const props = { phone: false, onSelect: vi.fn(), labelFor: () => 'label' };
  const renderNode = (entry: SelectedNode) => (isSkeletonNode(entry.node) ? null : entry.node.name);
  const positionOf = (element: Element) =>
    (element as HTMLElement).style.transform.match(/translate3d\(([^)]*)\)/)?.[1];

  it('marks the stage busy and makes the placeholders inert', () => {
    render(<ConnectionsCanvas selection={skeleton} renderNode={renderNode} {...props} />);
    runFrames(100);
    const stage = screen.getByTestId('connections-stage');
    expect(stage.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryAllByRole('button', { name: /./ }).filter(b => b.dataset.nodeId)).toHaveLength(0);
    expect(stage.querySelectorAll('[data-skeleton-node][aria-hidden="true"]')).toHaveLength(skeleton.nodes.length);
  });

  it('hands over to the real graph: real nodes start on the placeholders, which fade out', () => {
    const { rerender } = render(<ConnectionsCanvas selection={skeleton} renderNode={renderNode} {...props} />);
    runFrames(400);
    const stage = screen.getByTestId('connections-stage');
    const placeholderPositions = new Set(
      [...stage.querySelectorAll('[data-skeleton-node]:not([data-node-id="skeleton:centre"])')].map(element =>
        positionOf(element)
      )
    );
    rerender(<ConnectionsCanvas selection={selection} renderNode={renderNode} {...props} />);
    runFrames(now + 16);
    expect(stage.getAttribute('aria-busy')).toBeNull();
    // A hop-1 node's first frame is on a placeholder, not on the centre it would otherwise grow from.
    expect(placeholderPositions.has(positionOf(screen.getByRole('button', { name: 'Isaac Herzog' })))).toBe(true);
    expect(stage.querySelectorAll('[data-skeleton-node]').length).toBeGreaterThan(0);
    runFrames(now + 2000);
    // Let the removal timer run.
    return new Promise<void>(resolve =>
      setTimeout(() => {
        act(() => {});
        expect(stage.querySelectorAll('[data-skeleton-node]')).toHaveLength(0);
        expect(screen.getByRole('button', { name: 'Isaac Herzog' })).toBeTruthy();
        resolve();
      }, 500)
    );
  });

  it('holds still under reduced motion: no spin and no pulse', () => {
    motion.reduce = true;
    const { container } = render(
      <ConnectionsCanvas
        selection={skeleton}
        renderNode={entry => <span className={motion.reduce ? undefined : 'animate-pulse'}>{entry.node.id}</span>}
        {...props}
      />
    );
    runFrames(100);
    const first = [...container.querySelectorAll('[data-skeleton-node]')].map(element => positionOf(element));
    runFrames(8000);
    expect([...container.querySelectorAll('[data-skeleton-node]')].map(element => positionOf(element))).toEqual(first);
    expect(frames).toHaveLength(0);
  });
});

describe('ConnectionsCanvas leaving nodes', () => {
  const ring = (centreN: number): GraphSelection => {
    const middle = node(centreN, 'topic', `Centre ${centreN}`);
    const around = [1, 2, 3, 4].map(k => node(centreN * 10 + k, 'ent', `Around ${centreN}.${k}`));
    return {
      nodes: [
        { node: middle, hop: 0, parentId: null },
        ...around.map(entry => ({ node: entry, hop: 1 as const, parentId: middle.id })),
      ],
      links: [],
    };
  };

  it('fades leaving nodes out, and removes them all when the next selection lands mid-fade', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const props = {
        phone: false,
        onSelect: vi.fn(),
        renderNode: (entry: { node: GraphNode }) => entry.node.name,
        labelFor: () => 'label',
      };
      const { container, rerender } = render(<ConnectionsCanvas selection={ring(3)} {...props} />);
      const count = () => container.querySelectorAll('[data-node-id]').length;
      for (const centreN of [4, 5, 6, 7, 8]) {
        now += 100;
        act(() => vi.advanceTimersByTime(100));
        rerender(<ConnectionsCanvas selection={ring(centreN)} {...props} />);
        if (centreN === 4) expect(count()).toBe(10);
      }
      now += 1000;
      act(() => vi.advanceTimersByTime(1000));
      expect([...container.querySelectorAll('[data-node-id]')].map(element => element.textContent)).toEqual([
        'Centre 8',
        'Around 8.1',
        'Around 8.2',
        'Around 8.3',
        'Around 8.4',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('GraphTopBar chips', () => {
  const bar = (kinds: GraphKind[]) =>
    render(
      <GraphTopBar
        back={null}
        trail={['Centre']}
        search={null}
        kinds={kinds}
        kindFilter="all"
        onKindFilter={() => {}}
        close={null}
      />
    );

  it('offers Everything plus the kinds actually around the centre, never Topics', () => {
    bar(['topic', 'ent', 'story']);
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
      'Everything',
      'People and groups',
      'News',
    ]);
  });

  it('shows no chips when nothing but topics is around', () => {
    bar(['topic']);
    expect(screen.queryByRole('group', { name: 'Show' })).toBeNull();
  });
});

describe('GraphTopBar share', () => {
  const bar = (share: React.ComponentProps<typeof GraphTopBar>['share']) =>
    render(
      <GraphTopBar
        back={null}
        trail={['Centre']}
        search={null}
        kinds={[]}
        kindFilter="all"
        onKindFilter={() => {}}
        share={share}
        close={null}
      />
    );

  it('copies on desktop and says so', async () => {
    const onShare = vi.fn(async () => 'copied' as const);
    bar({ native: false, onShare });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy link' })));
    expect(onShare).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('offers Share on phones, stays put when the sheet was used, and admits a failed copy', async () => {
    const onShare = vi.fn(async () => 'shared' as const);
    bar({ native: true, onShare });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Share' })));
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
    onShare.mockRejectedValueOnce(new Error('denied'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Share' })));
    expect(screen.getByRole('button', { name: 'Couldn’t copy' })).toBeTruthy();
  });

  it('has no share control without a topic to share in', () => {
    bar(null);
    expect(screen.queryByRole('button', { name: /copy|share/i })).toBeNull();
  });
});

describe('GraphSearch', () => {
  it('reports one search per focus that typed, with the result count only', () => {
    const onSearched = vi.fn();
    render(<GraphSearch nodes={[person]} onPick={vi.fn()} onSearched={onSearched} />);
    const box = screen.getByRole('combobox', { name: 'Find on the map' });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'Is' } });
    fireEvent.change(box, { target: { value: 'Isa' } });
    fireEvent.blur(box);
    fireEvent.focus(box);
    fireEvent.blur(box);
    expect(onSearched.mock.calls).toEqual([[1]]);
  });
});

describe('searchNodes', () => {
  it('finds names containing the text, those starting with it first, ignoring case', () => {
    const nodes = [node(3, 'ent', 'Benjamin Netanyahu'), node(4, 'story', 'Netanyahu visits'), node(5, 'src', 'Other')];
    expect(searchNodes(nodes, 'netan').map(n => n.name)).toEqual(['Netanyahu visits', 'Benjamin Netanyahu']);
    expect(searchNodes(nodes, '  ')).toEqual([]);
  });
});

describe('clearance', () => {
  const centre = { left: 100, right: 200, top: 100, bottom: 160 };

  it('leaves a card that clears the centre alone', () => {
    expect(clearance(centre, { left: 220, right: 300, top: 100, bottom: 140 })).toEqual([0, 0]);
  });

  it('moves an overlapping card the shortest way off the centre, past a margin', () => {
    expect(clearance(centre, { left: 180, right: 260, top: 110, bottom: 150 })).toEqual([30, 0]);
    expect(clearance(centre, { left: 120, right: 180, top: 150, bottom: 190 })).toEqual([0, 20]);
    expect(clearance(centre, { left: 120, right: 180, top: 80, bottom: 105 })).toEqual([0, -15]);
  });

  it('counts the margin as touching the centre', () => {
    expect(overlaps(centre, { left: 205, right: 260, top: 110, bottom: 150 })).toBe(true);
    expect(overlaps(centre, { left: 211, right: 260, top: 110, bottom: 150 })).toBe(false);
  });
});

describe('settlePushes', () => {
  const centre = { left: 600, right: 840, top: 400, bottom: 560 };
  // The topic map at 1440: two hop-1 debate cards (card + label) one above the other, the front one nearer.
  const front = {
    rect: { left: 100, right: 292, top: 100, bottom: 250 },
    depth: -80,
    push: [0, 0] as [number, number],
  };
  const back = { rect: { left: 130, right: 262, top: 215, bottom: 320 }, depth: 40, push: [0, 0] as [number, number] };

  it('keeps a node off a nearer share card, past the margin', () => {
    const [kept, moved] = settlePushes(
      centre,
      [
        { ...front, card: true },
        { ...back, card: true },
      ],
      1
    );
    expect(kept.push).toEqual([0, 0]);
    expect(moved.push).toEqual([0, 45]);
    expect(overlaps(front.rect, { ...back.rect, top: back.rect.top + 45, bottom: back.rect.bottom + 45 })).toBe(false);
  });

  it('keeps a share card off a nearer node that is not a card', () => {
    const [, moved] = settlePushes(
      centre,
      [
        { ...front, card: false },
        { ...back, card: true },
      ],
      1
    );
    expect(moved.push).toEqual([0, 45]);
  });

  it('leaves two circles where depth puts them, as before cards', () => {
    const settled = settlePushes(
      centre,
      [
        { ...front, card: false },
        { ...back, card: false },
      ],
      1
    );
    expect(settled.map(entry => entry.push)).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('decides who moves by depth, not by list order', () => {
    const [moved, kept] = settlePushes(
      centre,
      [
        { ...back, card: true },
        { ...front, card: true },
      ],
      1
    );
    expect(kept.push).toEqual([0, 0]);
    expect(moved.push).toEqual([0, 45]);
  });

  it('still keeps every node off the centre, which wins over a card', () => {
    const nearCentre = {
      rect: { left: 620, right: 700, top: 540, bottom: 600 },
      depth: 10,
      card: false,
      push: [0, 0] as [number, number],
    };
    expect(settlePushes(centre, [nearCentre], 1)[0].push).toEqual([0, 30]);
  });

  it('eases back once nothing is in the way, but jumps straight off an overlap', () => {
    const [kept, moved] = settlePushes(
      centre,
      [
        { ...front, card: true, push: [0, 0] },
        { ...back, card: true, push: [0, 0] },
      ],
      0.2
    );
    expect(kept.push).toEqual([0, 0]);
    expect(moved).toEqual({ target: [0, 45], push: [0, 45] });
    const far = {
      rect: { left: 1000, right: 1100, top: 0, bottom: 50 },
      depth: 0,
      card: true,
      push: [0, 40] as [number, number],
    };
    expect(settlePushes(centre, [far], 0.2)[0]).toEqual({ target: [0, 0], push: [0, 32] });
  });
});

describe('overlapShare', () => {
  it('is the share of the smaller card the two cover', () => {
    const big = { left: 0, right: 100, top: 0, bottom: 100 };
    expect(overlapShare(big, { left: 50, right: 70, top: 50, bottom: 70 })).toBe(1);
    expect(overlapShare(big, { left: 90, right: 110, top: 0, bottom: 20 })).toBe(0.5);
    expect(overlapShare(big, { left: 100, right: 120, top: 0, bottom: 20 })).toBe(0);
  });
});

describe('nodeScale', () => {
  it('draws the centre at least full size, larger with depth on desktop and fixed on phone', () => {
    expect(nodeScale(true, 0, 1.3, false)).toBeCloseTo(1.456);
    expect(nodeScale(true, 0, 2, false)).toBe(1.5);
    expect(nodeScale(true, 0, 0.5, false)).toBe(1);
    expect(nodeScale(true, 0, 2, true)).toBe(1);
    expect(nodeScale(false, 2, 1, false)).toBeCloseTo(0.95);
    expect(nodeScale(false, 1, 0.1, true)).toBe(0.3);
  });
});
