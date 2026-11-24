import { cleanup, fireEvent, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GraphNode } from '~/core/graph-explorer/fetch-graph-neighbourhood';

import { NodeCard } from './connections/node-card';
import { CentreHeader } from './entity-panel';

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));

const CARD = 'https://cards.example/debate.png';
const AVATAR = 'https://cards.example/avatar.png';

const debate = (extra: Partial<GraphNode> = {}): GraphNode => ({
  id: '1'.repeat(32),
  name: "There's no genocide in Gaza",
  kind: 'other',
  spaceIds: [],
  namedSpaceIds: [],
  placedSpaceIds: [],
  types: [{ id: 'd', name: 'Debate' }],
  image: null,
  card: CARD,
  typeRank: 0,
  date: null,
  agrees: 0,
  disagrees: 0,
  ...extra,
});
const centre = (extra: Partial<GraphNode> = {}) => ({ ...debate(extra), description: null, texts: [] });

const anchorOf = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-anchor]')!;

afterEach(cleanup);

describe('a debate on the map', () => {
  it('draws its share card as a wide box at the centre and as a neighbour', () => {
    for (const [hop, isCentre, width, height] of [
      [0, true, 240, 126],
      [1, false, 160, 84],
      [2, false, 64, 34],
    ] as const) {
      const { container } = render(
        <NodeCard node={debate()} hop={hop} isCentre={isCentre} phone={false} claimSpaceId={null} />
      );
      const anchor = anchorOf(container);
      expect(anchor.querySelector('img')?.getAttribute('src')).toBe(CARD);
      expect(anchor.style.width).toBe(`${width}px`);
      expect(anchor.style.height).toBe(`${height}px`);
      cleanup();
    }
  });

  it('falls back to the circle with its letter when it has no card, or the card fails to load', () => {
    const { container: none } = render(
      <NodeCard node={debate({ card: null })} hop={1} isCentre={false} phone={false} claimSpaceId={null} />
    );
    expect(anchorOf(none).querySelector('img')).toBeNull();
    expect(anchorOf(none).textContent).toBe('T');
    cleanup();

    const { container } = render(
      <NodeCard node={debate()} hop={1} isCentre={false} phone={false} claimSpaceId={null} />
    );
    fireEvent.error(anchorOf(container).querySelector('img')!);
    expect(anchorOf(container).querySelector('img')).toBeNull();
    expect(anchorOf(container).textContent).toBe('T');
    expect(anchorOf(container).style.width).toBe('52px');
  });

  it('falls back to the avatar, not the letter, when the card fails and there is one', () => {
    const { container } = render(
      <NodeCard node={debate({ image: AVATAR })} hop={1} isCentre={false} phone={false} claimSpaceId={null} />
    );
    fireEvent.error(anchorOf(container).querySelector('img')!);
    expect(anchorOf(container).querySelector('img')?.getAttribute('src')).toBe(AVATAR);
  });
});

describe('a debate in the side panel', () => {
  it('shows its share card above the title, in place of the letter avatar', () => {
    const { container, getByRole } = render(<CentreHeader centre={centre()} />);
    const card = container.querySelector<HTMLImageElement>('img[data-card]')!;
    expect(card.getAttribute('src')).toBe(CARD);
    expect(card.compareDocumentPosition(getByRole('heading')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('shows the letter avatar with no card, and after the card fails to load', () => {
    const { container: none } = render(<CentreHeader centre={centre({ card: null })} />);
    expect(none.querySelector('img')).toBeNull();
    expect(none.querySelector('[aria-hidden]')?.textContent).toBe('T');
    cleanup();

    const { container } = render(<CentreHeader centre={centre()} />);
    fireEvent.error(container.querySelector('img[data-card]')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[aria-hidden]')?.textContent).toBe('T');
  });
});
