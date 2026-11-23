import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';
import type { GraphKind } from '~/core/graph-explorer/graph-kinds';
import type { GraphSelection } from '~/core/graph-explorer/select-graph';

import { ConnectionsCanvas } from './connections-canvas';
import { searchNodes } from './graph-search';
import { GraphTopBar } from './graph-top-bar';

const motion = vi.hoisted(() => ({ reduce: false }));
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
