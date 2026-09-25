import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityStickyHeader } from './entity-sticky-header';
import { entityStickyHeaderHostElementAtom } from '~/atoms';

const mocks = vi.hoisted(() => ({
  storedName: null as string | null,
  /** Stands in for the tracked title element the bar measures its column from. */
  title: null as Element | null,
  queriedName: null as string | null,
  mediaUrl: undefined as string | undefined,
  scrolledPast: true,
  /** Props `EntityVoteButtons` was handed, or null if the bar drew none. */
  voteProps: null as Record<string, unknown> | null,
  /** The arguments `useScrolledPastElement` was called with on the last render. */
  scrollOptions: null as Record<string, unknown> | null,
  /** What the page's content column measured, or null when there is none to mirror. */
  column: null as { left: number; width: number } | null,
  /** The (anchor, host, attribute) the bar asked to mirror. */
  columnArgs: null as unknown[] | null,
}));

vi.mock('~/core/hooks/use-scrolled-past-element', () => ({
  useScrolledPastElement: (options: Record<string, unknown>) => {
    mocks.scrollOptions = options;
    return { scrolledPast: mocks.scrolledPast, target: mocks.title };
  },
}));
vi.mock('~/core/hooks/use-mirrored-content-column', () => ({
  useMirroredContentColumn: (...args: unknown[]) => {
    mocks.columnArgs = args;
    return mocks.column;
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
  mocks.title = null;
  mocks.column = null;
  mocks.columnArgs = null;
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

  /**
   * Everywhere else the faces lead, because they sit inside a card with the claim's text above them.
   * In the bar the name runs right up to the control, and faces between the two read as part of the
   * name rather than as part of the tally they belong to.
   */
  it('puts a claim’s responder faces after the thumbs, not before them', () => {
    renderBar();

    expect(mocks.voteProps).toMatchObject({ claimResponderAvatarsPosition: 'trailing' });
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

  /**
   * The pages this bar covers are 900, 840, 720 and 1142 wide with two different gutters, so a width
   * written here would be a fourth opinion that drifts. It mirrors whichever column the title it is
   * tracking sits in.
   */
  it('matches the page’s own content column when there is one to measure', () => {
    mocks.column = { left: 220, width: 800 };
    renderBar();

    const row = screen.getByTestId('entity-sticky-header-row');
    expect(row).toHaveStyle({ marginLeft: '220px', width: '800px' });
    // No centring and no gutter of its own: both come from the column it copied.
    expect(row).not.toHaveClass('mx-auto');
    expect(row).not.toHaveClass('px-4');
  });

  /**
   * A collapsed sidebar insets the host by the rail's 24px while the page's column still starts at
   * the content edge, so a viewport narrow enough for the column to reach that edge puts the
   * mirrored offset below zero — and a negative margin paints the avatar and the name outside the
   * bar's own white background, over the rail.
   */
  it('never draws outside its own background when the column starts left of the host', () => {
    mocks.column = { left: -24, width: 900 };
    renderBar();

    // The right edge is held while the left is clamped: what gives is the one edge that cannot be
    // honoured, not both.
    expect(screen.getByTestId('entity-sticky-header-row')).toHaveStyle({ marginLeft: '0px', width: '876px' });
  });

  it('mirrors the column around the title it tracks, in the host’s coordinates', () => {
    const title = document.createElement('h1');
    mocks.title = title;
    renderBar();

    const [anchor, host, attribute] = mocks.columnArgs ?? [];
    expect(anchor).toBe(title);
    expect(host).toBe(screen.getByTestId('entity-sticky-header').parentElement);
    expect(attribute).toBe('data-entity-page-content');
  });

  it('falls back to the generic page width for a view that tags no column', () => {
    renderBar();

    const row = screen.getByTestId('entity-sticky-header-row');
    expect(row).toHaveStyle({ maxWidth: '900px' });
    expect(row).toHaveClass('mx-auto');
  });

  it('draws nothing before the shell has registered its host', () => {
    renderBar({ withHost: false });

    expect(screen.queryByTestId('entity-sticky-header')).not.toBeInTheDocument();
  });
});
