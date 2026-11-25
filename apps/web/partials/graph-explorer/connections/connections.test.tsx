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

import {
  ConnectionsCanvas,
  centreCrossDim,
  coveredLabels,
  depthOrder,
  nodeScale,
  overlapShare,
  tooSmallToRead,
} from './connections-canvas';
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
const view = vi.hoisted(() => ({
  fits: [] as Array<{ width: number; height: number; fit: number }>,
  distance: 0,
  /** Every point projected since the test last cleared it. */
  projected: [] as Array<{ x: number; y: number; scale: number; depth: number }>,
}));
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
      const point = real.project(...args);
      // A copy: the frame may move the point it was handed, as the old centre push did.
      view.projected.push({ ...point });
      return point;
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
  view.projected = [];
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

  it('marks a hop-1 card far while zoomed out past reading size, never the centre, and drops it zoomed back in', () => {
    motion.reduce = true;
    render(<Canvas />);
    runFrames(100);
    const isaac = () => screen.getByRole('button', { name: 'Isaac Herzog' });
    const centreButton = screen.getByRole('button', { name: 'Centre' });
    const zoom = (name: 'Zoom in' | 'Zoom out', times: number) => {
      for (let i = 0; i < times; i++) {
        fireEvent.click(screen.getByRole('button', { name }));
        runFrames(now + 100);
      }
    };
    expect(isaac().dataset.far).toBeUndefined();
    zoom('Zoom out', 8);
    expect(isaac().dataset.far).toBe('');
    expect(centreButton.dataset.far).toBeUndefined();

    zoom('Zoom in', 8);
    expect(isaac().dataset.far).toBeUndefined();
  });

  it('clears a `data-far` its button carries from before, once the card is drawn readable', () => {
    // A node picked again while its button is still fading out keeps that button, and its
    // `data-far`, but gets a fresh view; the frame must go by the button.
    motion.reduce = true;
    render(<Canvas />);
    runFrames(100);
    const isaac = screen.getByRole('button', { name: 'Isaac Herzog' });
    isaac.dataset.far = '';
    // Wakes the settled loop for a frame.
    fireEvent.mouseEnter(isaac);
    runFrames(now + 100);
    expect(isaac.dataset.far).toBeUndefined();
  });

  it('draws the centre focus ring clear of its white ring', () => {
    render(<Canvas />);
    expect(screen.getByRole('button', { name: 'Centre' }).className).toContain('focus-visible:outline-offset-[9px]');
    expect(screen.getByRole('button', { name: 'Centre' }).className).not.toContain('focus-visible:outline-offset-4');
    expect(screen.getByRole('button', { name: 'Isaac Herzog' }).className).toContain('focus-visible:outline-offset-4');
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

  it('keeps a card crossing the centre on its projected path, drawn by depth, never pushed aside', () => {
    // Cards this big always cover each other, so the old centre push would have moved Isaac.
    const sizes = (['offsetWidth', 'offsetHeight'] as const).map(key => {
      const old = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key);
      Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => 600 });
      return () => old && Object.defineProperty(HTMLElement.prototype, key, old);
    });
    try {
      render(<Canvas />);
      const isaac = screen.getByRole('button', { name: 'Isaac Herzog' });
      const centreButton = screen.getByRole('button', { name: 'Centre' });
      const at = (element: HTMLElement) => {
        const [, x, y] = /translate3d\(([-\d.]+)px,([-\d.]+)px/.exec(element.style.transform) ?? [];
        return { x: Number(x), y: Number(y) };
      };
      const pointAt = (spot: { x: number; y: number }) =>
        view.projected.find(point => Math.abs(point.x - spot.x) < 0.06 && Math.abs(point.y - spot.y) < 0.06);
      // Settle the move in, then sample the idle spin frame by frame.
      runFrames(2600 + 1000);
      let behind = 0;
      let inFront = 0;
      let faintest = 1;
      const shown: number[] = [];
      for (let i = 0; i < 2400; i++) {
        view.projected = [];
        runFrames(now + 16);
        const own = pointAt(at(isaac));
        const middle = pointAt(at(centreButton));
        expect(own).toBeDefined();
        expect(middle).toBeDefined();
        const lower = Number(isaac.style.zIndex) < Number(centreButton.style.zIndex);
        expect(lower).toBe(own!.depth > middle!.depth);
        const opacity = Number(isaac.style.opacity);
        if (lower) {
          behind++;
          faintest = Math.min(faintest, opacity);
        } else {
          inFront++;
          shown.push(opacity);
        }
      }
      // The spin carried Isaac across the centre both ways, faint behind it and readable over it.
      expect(behind).toBeGreaterThan(0);
      expect(inFront).toBeGreaterThan(0);
      expect(faintest).toBeLessThanOrEqual(0.121);
      expect(Math.max(...shown)).toBeGreaterThan(0.3);
    } finally {
      sizes.forEach(restore => restore());
    }
  });

  it("keeps a hovered card's neighbour on its own side of the centre, and lifts only the hovered card", () => {
    const sizes = (['offsetWidth', 'offsetHeight'] as const).map(key => {
      const old = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key);
      Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => 600 });
      return () => old && Object.defineProperty(HTMLElement.prototype, key, old);
    });
    // A hop-2 marker whose only neighbour is Isaac, so hovering it lifts Isaac but not the centre.
    const marker = node(3, 'ent', 'Marker');
    const withMarker: GraphSelection = {
      nodes: [...selection.nodes, { node: marker, hop: 2, parentId: person.id }],
      links: [
        ...selection.links,
        {
          hop: 2,
          edge: { id: 'e2', fromId: person.id, toId: marker.id, propertyId: 'p', propertyName: 'Knows', spaceId: 's' },
        },
      ],
    };
    try {
      render(
        <ConnectionsCanvas
          selection={withMarker}
          phone={false}
          onSelect={vi.fn()}
          renderNode={entry => entry.node.name}
          labelFor={() => 'label'}
        />
      );
      const isaac = screen.getByRole('button', { name: 'Isaac Herzog' });
      const centreButton = screen.getByRole('button', { name: 'Centre' });
      const markerButton = screen.getByRole('button', { name: 'Marker' });
      runFrames(2600 + 1000);
      fireEvent.mouseEnter(markerButton);
      let behind = 0;
      let faintest = 1;
      for (let i = 0; i < 2400; i++) {
        view.projected = [];
        runFrames(now + 16);
        expect(Number(markerButton.style.zIndex)).toBe(9500);
        if (Number(isaac.style.zIndex) < Number(centreButton.style.zIndex)) {
          behind++;
          faintest = Math.min(faintest, Number(isaac.style.opacity));
        }
      }
      // Isaac still passes behind the centre, and fades there, while the marker is hovered.
      expect(behind).toBeGreaterThan(0);
      expect(faintest).toBeLessThanOrEqual(0.121);
      // The hovered card itself is never faded by the centre.
      fireEvent.mouseLeave(markerButton);
      fireEvent.mouseEnter(isaac);
      runFrames(now + 2000);
      expect(Number(isaac.style.opacity)).toBe(1);
    } finally {
      sizes.forEach(restore => restore());
    }
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
  const bar = (kinds: GraphKind[], kindFilter: GraphKind | 'all' = 'all') => (
    <GraphTopBar
      back={null}
      trail={['Centre']}
      search={null}
      kinds={kinds}
      kindFilter={kindFilter}
      onKindFilter={() => {}}
      close={null}
    />
  );
  const pressed = () =>
    screen
      .getAllByRole('button')
      .filter(button => button.getAttribute('aria-pressed') === 'true')
      .map(button => button.textContent);

  it('keeps the chip in force, pressed and in kind order, when none of its kind is around', () => {
    render(bar(['topic', 'ent', 'src'], 'claim'));
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
      'Everything',
      'People and groups',
      'Claims',
      'Sources',
    ]);
    expect(pressed()).toEqual(['Claims']);
  });

  it('keeps the row, so Everything is reachable, when only topics are around a filtered map', () => {
    render(bar(['topic'], 'event'));
    expect(pressed()).toEqual(['Events']);
    expect(screen.getByRole('button', { name: 'Everything' })).toBeTruthy();
  });

  describe('in a row that scrolls', () => {
    // jsdom has no layout: a 100px row whose chips sit 120px apart, so only the first fits.
    const restore: Array<() => void> = [];
    beforeEach(() => {
      const original = HTMLElement.prototype.getBoundingClientRect;
      HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
        const row = this.closest('[role="group"]') as HTMLElement | null;
        if (this.getAttribute('role') === 'group') return { left: 0, right: 100 } as DOMRect;
        if (!row || this.tagName !== 'BUTTON') return original.call(this);
        const left = [...row.children].indexOf(this) * 120 - row.scrollLeft;
        return { left, right: left + 100 } as DOMRect;
      };
      restore.push(() => {
        HTMLElement.prototype.getBoundingClientRect = original;
      });
    });
    afterEach(() => restore.splice(0).forEach(undo => undo()));
    const row = () => screen.getByRole('group', { name: 'Show' });

    it('scrolls a pressed chip past the edge into view when it opens on it', () => {
      render(bar(['ent', 'claim', 'story'], 'story'));
      expect(row().scrollLeft).toBe(360);
    });

    it('leaves a chip already in view alone, and scrolls just far enough to one set for the viewer', () => {
      const { rerender } = render(bar(['ent', 'claim', 'story']));
      expect(row().scrollLeft).toBe(0);
      rerender(bar(['ent', 'claim', 'story'], 'story'));
      expect(row().scrollLeft).toBe(360);
      rerender(bar(['ent', 'claim', 'story'], 'claim'));
      expect(row().scrollLeft).toBe(240);
    });

    it('scrolls once the chips arrive, as they do after the first hop loads', () => {
      const { rerender } = render(bar([], 'story'));
      rerender(bar(['ent', 'claim', 'story'], 'story'));
      expect(row().scrollLeft).toBe(360);
    });
  });

  it('offers Everything plus the kinds actually around the centre, never Topics', () => {
    render(bar(['topic', 'ent', 'story']));
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
      'Everything',
      'People and groups',
      'News',
    ]);
  });

  it('shows no chips when nothing but topics is around', () => {
    render(bar(['topic']));
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

describe('depthOrder', () => {
  it('stacks nearer cards higher, the centre strictly between those behind and those in front', () => {
    expect(depthOrder(0, true, 0)).toBe(5000);
    expect(depthOrder(-200, false, 0)).toBe(5200);
    expect(depthOrder(300, false, 0)).toBe(4700);
    // Within rounding of the centre, a card still lands on its own side of it.
    expect(depthOrder(0.2, false, 0)).toBe(4999);
    expect(depthOrder(-0.2, false, 0)).toBe(5001);
    expect(depthOrder(0, false, 0)).toBe(5001);
  });
});

describe('centreCrossDim', () => {
  const centre = { rect: { left: 100, right: 200, top: 100, bottom: 160 }, depth: 0 };

  it('leaves a card clear of the centre alone', () => {
    expect(centreCrossDim({ left: 220, right: 300, top: 100, bottom: 140 }, 50, centre)).toBe(1);
  });

  it('fades a card behind the centre in step with how much of it is covered, down to faint', () => {
    expect(centreCrossDim({ left: 120, right: 180, top: 110, bottom: 150 }, 50, centre)).toBeCloseTo(0.12);
    expect(centreCrossDim({ left: 170, right: 230, top: 110, bottom: 150 }, 50, centre)).toBeCloseTo(0.56);
  });

  it('fades a card passing in front only a little', () => {
    expect(centreCrossDim({ left: 120, right: 180, top: 110, bottom: 150 }, -50, centre)).toBeCloseTo(0.75);
    expect(centreCrossDim({ left: 170, right: 230, top: 110, bottom: 150 }, -50, centre)).toBeCloseTo(0.875);
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

describe('coveredLabels', () => {
  const box = (left: number, top = 0) => ({ left, right: left + 100, top, bottom: top + 40 });
  const slot = (left: number, depth: number, extra: { keep?: boolean; shown?: boolean; top?: number } = {}) => ({
    rect: box(left, extra.top),
    depth,
    keep: extra.keep ?? false,
    shown: extra.shown ?? true,
  });

  it('fades the farther of two touching labels and leaves apart ones alone', () => {
    expect(coveredLabels([slot(0, 50), slot(60, -20), slot(400, 90)])).toEqual([true, false, false]);
    // Edges that only meet do not overlap.
    expect(coveredLabels([slot(0, 50), slot(100, -20)])).toEqual([false, false]);
  });

  it('lets a label a faded one would have covered show, so a chain keeps every other card', () => {
    expect(coveredLabels([slot(0, 0), slot(60, 10), slot(120, 20)])).toEqual([false, true, false]);
  });

  it('never fades the hovered card or its neighbours, and fades what they cover instead', () => {
    expect(coveredLabels([slot(0, 100, { keep: true }), slot(60, -50)])).toEqual([false, true]);
    expect(coveredLabels([slot(0, 100, { keep: true }), slot(60, -50, { keep: true })])).toEqual([false, false]);
  });

  it('keeps the one already showing when depths cross, so the pair does not flicker', () => {
    expect(coveredLabels([slot(0, 10, { shown: true }), slot(60, 9, { shown: false })])).toEqual([false, true]);
  });
});

describe('tooSmallToRead', () => {
  it('turns a card into its marker below 0.6 and back only above 0.7, so it does not flap', () => {
    expect(tooSmallToRead(0.59, false, false)).toBe(true);
    expect(tooSmallToRead(0.65, false, false)).toBe(false);
    expect(tooSmallToRead(0.65, true, false)).toBe(true);
    expect(tooSmallToRead(0.71, true, false)).toBe(false);
  });

  it('cuts lower on phone, whose whole map is drawn smaller', () => {
    expect(tooSmallToRead(0.55, false, true)).toBe(false);
    expect(tooSmallToRead(0.49, false, true)).toBe(true);
    expect(tooSmallToRead(0.55, true, true)).toBe(true);
    expect(tooSmallToRead(0.59, true, true)).toBe(false);
  });
});
