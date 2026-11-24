import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import type { GraphKind } from '~/core/graph-explorer/graph-kinds';
import type { GraphSelection } from '~/core/graph-explorer/select-graph';

import { ConnectionsCanvas, clearance, overlapShare } from './connections-canvas';
import { searchNodes } from './graph-search';
import { GraphTopBar } from './graph-top-bar';

const motion = vi.hoisted(() => ({ reduce: false }));
/** IntersectionObserver callbacks, so a test can scroll the stage off-screen. */
const sight = vi.hoisted(() => ({ callbacks: [] as IntersectionObserverCallback[] }));
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
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  // jsdom has no 2D canvas; every drawing call is a no-op.
  const context = new Proxy({}, { get: (_, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => {}) });
  HTMLCanvasElement.prototype.getContext = (() => context) as never;
});

beforeEach(() => {
  sight.callbacks = [];
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
});

describe('overlapShare', () => {
  it('is the share of the smaller card the two cover', () => {
    const big = { left: 0, right: 100, top: 0, bottom: 100 };
    expect(overlapShare(big, { left: 50, right: 70, top: 50, bottom: 70 })).toBe(1);
    expect(overlapShare(big, { left: 90, right: 110, top: 0, bottom: 20 })).toBe(0.5);
    expect(overlapShare(big, { left: 100, right: 120, top: 0, bottom: 20 })).toBe(0);
  });
});
