import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityStickyHeader } from './entity-sticky-header';
import { entityStickyHeaderHostElementAtom } from '~/atoms';

const mocks = vi.hoisted(() => ({
  storedName: null as string | null,
  queriedName: null as string | null,
  mediaUrl: undefined as string | undefined,
  scrolledPast: true,
  /** Props `EntityVoteButtons` was handed, or null if the bar drew none. */
  voteProps: null as Record<string, unknown> | null,
  /** The arguments `useScrolledPastElement` was called with on the last render. */
  scrollOptions: null as Record<string, unknown> | null,
}));

vi.mock('~/core/hooks/use-scrolled-past-element', () => ({
  useScrolledPastElement: (options: Record<string, unknown>) => {
    mocks.scrollOptions = options;
    return mocks.scrolledPast;
  },
}));
vi.mock('~/core/state/entity-page-store/entity-store', () => ({
  useName: () => mocks.storedName,
}));
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: mocks.queriedName ? { name: mocks.queriedName } : null, isLoading: false }),
}));
vi.mock('~/core/utils/use-entity-media', () => ({
  useEntityMediaUrl: () => mocks.mediaUrl,
}));
// The real control reaches for the sync engine, wallet and response queries. What matters here is
// that the bar hands it the entity, not what it draws.
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: (props: Record<string, unknown>) => {
    mocks.voteProps = props;
    return <div data-testid="vote-buttons" />;
  },
}));

function renderBar({ withHost = true }: { withHost?: boolean } = {}) {
  const store = createStore();

  if (withHost) {
    const host = document.createElement('div');
    document.body.append(host);
    store.set(entityStickyHeaderHostElementAtom, host);
  }

  return render(
    <Provider store={store}>
      <EntityStickyHeader entityId="entity-1" spaceId="space-1" />
    </Provider>
  );
}

beforeEach(() => {
  mocks.storedName = 'Vitalik Buterin';
  mocks.queriedName = null;
  mocks.mediaUrl = undefined;
  mocks.scrolledPast = true;
  mocks.voteProps = null;
  mocks.scrollOptions = null;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('EntityStickyHeader', () => {
  it('draws the name and the entity interaction once the title has scrolled away', () => {
    renderBar();

    expect(screen.getByTestId('entity-sticky-header')).toBeInTheDocument();
    expect(screen.getByText('Vitalik Buterin')).toBeInTheDocument();
    // Unmodified: the control decides upvote/downvote vs. agree/disagree from the entity's types,
    // and the bar must not make that call a second time.
    expect(mocks.voteProps).toMatchObject({ entityId: 'entity-1', spaceId: 'space-1' });
  });

  it('draws nothing until the title has scrolled away', () => {
    mocks.scrolledPast = false;
    renderBar();

    expect(screen.queryByTestId('entity-sticky-header')).not.toBeInTheDocument();
  });

  it('draws nothing for an entity with no name', () => {
    mocks.storedName = null;
    mocks.scrolledPast = false;
    renderBar();

    expect(screen.queryByTestId('entity-sticky-header')).not.toBeInTheDocument();
    // And does not pay for an observer it could never act on.
    expect(mocks.scrollOptions).toMatchObject({ enabled: false });
  });

  it('falls back to the hydrated name when the route space holds none', () => {
    mocks.storedName = null;
    mocks.queriedName = 'A claim that lives in another space';
    renderBar();

    expect(screen.getByText('A claim that lives in another space')).toBeInTheDocument();
  });

  it('watches only this entity’s title, below the navbar', () => {
    renderBar();

    expect(mocks.scrollOptions).toMatchObject({
      selector: '[data-entity-page-title="entity-1"]',
      topOffset: 44,
      enabled: true,
    });
  });

  it('shows the avatar or cover when the entity has one', () => {
    mocks.mediaUrl = 'https://example.com/avatar.png';
    renderBar();

    const image = screen.getByTestId('entity-sticky-header').querySelector('img');
    expect(image).toHaveAttribute('src', 'https://example.com/avatar.png');
  });

  it('leaves the image out rather than drawing a placeholder', () => {
    renderBar();

    expect(screen.getByTestId('entity-sticky-header').querySelector('img')).toBeNull();
  });

  it('clamps the name to a single line', () => {
    renderBar();

    expect(screen.getByText('Vitalik Buterin')).toHaveClass('truncate');
  });

  it('draws nothing before the shell has registered its host', () => {
    renderBar({ withHost: false });

    expect(screen.queryByTestId('entity-sticky-header')).not.toBeInTheDocument();
  });
});
