import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CuratorLeaderboardResult } from '~/core/community/curator-leaderboard-types';

import { CuratorLeaderboardSection } from './curator-leaderboard-section';

// The period pill is a popover, which measures itself; jsdom has no layout and no observer for it.
beforeEach(() => {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

// Several cases render more than once, and the rest query by role across the whole document.
afterEach(cleanup);

const CURATOR_SPACE_ID = 'd4bee0928fb5405baba3b1513f085835';
const VIEWER_SPACE_ID = '4c81561d1f9541319cdddd20ab831ba2';

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: VIEWER_SPACE_ID, isRegistered: true }),
}));

vi.mock('~/design-system/avatar', () => ({
  Avatar: () => <div data-testid="avatar" />,
}));

// Spreads the rest, or a link whose name comes from `aria-label` rather than its text — the expand
// icon — arrives with no accessible name at all, and the mock decides what the test can see.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...rest }: React.ComponentPropsWithoutRef<'a'>) => <a {...rest}>{children}</a>,
}));

function row(overrides: Partial<CuratorLeaderboardResult['rows'][number]> = {}) {
  return {
    curatorSpaceId: CURATOR_SPACE_ID,
    name: 'Ada',
    avatarUrl: null,
    rankings: 3,
    newsStories: 1,
    votes: 2,
    submissions: 0,
    debates: 1,
    activityScore: 4,
    rank: 1,
    isCurrentUser: false,
    ...overrides,
  };
}

function renderSection(initialData: CuratorLeaderboardResult, { expanded = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <CuratorLeaderboardSection spaceId="space-1" initialData={initialData} expanded={expanded} />
    </QueryClientProvider>
  );
}

function result(
  rows: CuratorLeaderboardResult['rows'],
  currentUserRow: CuratorLeaderboardResult['currentUserRow'] = null
) {
  return {
    period: 'week',
    metrics: { activeCurators: rows.length, rankings: 0, newsStories: 0, debates: 0 },
    rows,
    currentUserRow,
    truncated: false,
  } satisfies CuratorLeaderboardResult;
}

/** A board of `count` curators, ranked, with distinguishable names. */
function board(
  count: number,
  overrides: (index: number) => Partial<CuratorLeaderboardResult['rows'][number]> = () => ({})
) {
  return Array.from({ length: count }, (_, index) =>
    row({
      curatorSpaceId: `${index}`.padStart(32, 'a'),
      name: `Curator ${index + 1}`,
      rank: index + 1,
      ...overrides(index),
    })
  );
}

/** The curator named in each body row, in order — the header row dropped. */
/** The numbered page buttons, in order. */
const pageNumbers = () =>
  screen
    .getAllByRole('button')
    .map(button => button.textContent ?? '')
    .filter(label => /^\d+$/.test(label));

const next = () => screen.getByRole('button', { name: 'Next page' });
const previous = () => screen.getByRole('button', { name: 'Previous page' });

const namesOnPage = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map(tableRow => within(tableRow).getAllByRole('cell')[1]?.textContent ?? '');

describe('CuratorLeaderboardSection — paging', () => {
  // The board was a five-row slice with no way past it: a space with fourteen active curators
  // showed six rows and said 14 in the box above them.
  it('pages through curators the old fixed slice could not reach', () => {
    renderSection(result(board(12)));

    expect(namesOnPage()).toEqual(['Curator 1', 'Curator 2', 'Curator 3', 'Curator 4', 'Curator 5']);

    fireEvent.click(next());
    expect(namesOnPage()).toEqual(['Curator 6', 'Curator 7', 'Curator 8', 'Curator 9', 'Curator 10']);

    fireEvent.click(next());
    expect(namesOnPage()).toEqual(['Curator 11', 'Curator 12']);
  });

  // The shape every other paged table here uses: a number per page, not two arrows and a count.
  it('offers a numbered page for each page of the board', () => {
    renderSection(result(board(12)));

    expect(pageNumbers()).toEqual(['1', '2', '3']);
  });

  // Which is the point of numbering them — three pages on is one press, not three.
  it('jumps straight to a page by its number', () => {
    renderSection(result(board(12)));

    fireEvent.click(screen.getByRole('button', { name: '3' }));

    expect(namesOnPage()).toEqual(['Curator 11', 'Curator 12']);
  });

  it('cannot be paged off either end', () => {
    renderSection(result(board(7)));

    expect((previous() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(next());
    expect((next() as HTMLButtonElement).disabled).toBe(true);
  });

  // A board that fits on one page is not a paged board, and controls for it are noise.
  it('draws no controls for a board that fits', () => {
    renderSection(result(board(5)));

    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });
});

describe('CuratorLeaderboardSection — the viewer’s own row', () => {
  /**
   * Pinned to every page they are not already on, rather than only where they happen to fall. The
   * row answers "where am I", which is a question about the board rather than about the page — and
   * the one page it is not needed on is the page they are on.
   */
  it('pins the viewer to every page that does not already show them', () => {
    renderSection(result(board(12, index => (index === 10 ? { isCurrentUser: true, name: 'Me' } : {}))));

    expect(namesOnPage()).toEqual([
      'Curator 1',
      'Curator 2',
      'Curator 3',
      'Curator 4',
      'Curator 5',
      'You', // pinned: rank 11 is two pages away
    ]);

    fireEvent.click(next());
    expect(namesOnPage()).toEqual(['Curator 6', 'Curator 7', 'Curator 8', 'Curator 9', 'Curator 10', 'You']);
  });

  it('does not repeat them on the page they are actually on', () => {
    renderSection(result(board(12, index => (index === 10 ? { isCurrentUser: true, name: 'Me' } : {}))));

    fireEvent.click(next());
    fireEvent.click(next());

    // Rank 11 is the viewer, so the last page is their row in place, plus rank 12 — and not a
    // second copy pinned below it.
    expect(namesOnPage()).toEqual(['You', 'Curator 12']);
    expect(namesOnPage().filter(name => name === 'You')).toHaveLength(1);
  });

  // Somebody with no activity in the window is on no page at all, so the fetch hands their row over
  // separately and it is pinned the same way.
  it('pins a viewer who is not on the board at all', () => {
    renderSection(result(board(7), row({ curatorSpaceId: VIEWER_SPACE_ID, isCurrentUser: true, rank: 8 })));

    expect(namesOnPage().at(-1)).toBe('You');
    fireEvent.click(next());
    expect(namesOnPage().at(-1)).toBe('You');
  });
});

describe('CuratorLeaderboardSection — the way out to the full board', () => {
  const expand = () => screen.getByRole('link', { name: 'View the full leaderboard' });

  /**
   * The expand affordance, not the bounties sections' "View all". Those lead to the larger
   * collection they are a slice of; this leads to the same board with the room to show all of it,
   * which is what the arrows mean everywhere else in the app.
   *
   * A link rather than a button, so it opens in a tab on a modified click and shows its destination
   * on hover — the whole point of the board having a route.
   */
  it('offers the tab a link to the board’s own page', () => {
    renderSection(result(board(12)));

    expect(expand().getAttribute('href')).toBe('/space/space-1/community/leaderboard');
  });

  // Nothing has no fuller version of itself.
  it('is not offered for a board with nothing on it', () => {
    renderSection(result([]));

    expect(screen.queryByRole('link', { name: 'View the full leaderboard' })).toBeNull();
  });

  /**
   * Paging exists because the tab gives the board five rows' worth of room. On its own page that
   * constraint is gone, so it shows the board — opening onto page 1 of 3 again would be the same
   * view with more whitespace.
   */
  it('shows the whole board on its own page, unpaged', () => {
    renderSection(result(board(12)), { expanded: true });

    expect(namesOnPage()).toHaveLength(12);
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });

  // And does not offer a way out to the page it already is.
  it('offers no link from the page itself', () => {
    renderSection(result(board(12)), { expanded: true });

    expect(screen.queryByRole('link', { name: 'View the full leaderboard' })).toBeNull();
  });

  // It is what the board is *of*, so it comes along rather than being left on the tab.
  it('keeps the time window on the page', () => {
    renderSection(result(board(12)), { expanded: true });

    expect(screen.getByRole('button', { name: /Last week/ })).toBeTruthy();
  });

  /**
   * A viewer with no activity is on no page of the board, so they are pinned in the tab. The page
   * shows every row and still does not contain them — the pin is the only thing that answers "where
   * am I" for somebody who is nowhere.
   */
  it('still pins a viewer who is not on the board', () => {
    renderSection(result(board(7), row({ curatorSpaceId: VIEWER_SPACE_ID, isCurrentUser: true, rank: 8 })), {
      expanded: true,
    });

    expect(namesOnPage()).toHaveLength(8);
    expect(namesOnPage().at(-1)).toBe('You');
  });
});

describe('CuratorLeaderboardSection — the time window', () => {
  /**
   * The window decides who is on the board at all, so the page numbers either side of a change do
   * not describe the same list. Landing on page 3 of a shorter board is being shown the tail of
   * something the viewer did not ask for — or, past its end, nothing.
   */
  it('returns to the first page when the period changes', () => {
    renderSection(result(board(12)));

    fireEvent.click(next());
    expect(namesOnPage()).toEqual(['Curator 6', 'Curator 7', 'Curator 8', 'Curator 9', 'Curator 10']);

    fireEvent.click(screen.getByRole('button', { name: /Last week/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Last month' }));

    // And back, which is what makes this assertable without a fetch: the window it started on is the
    // one the server already answered, so its rows return and the pager with them.
    fireEvent.click(screen.getByRole('button', { name: /Last month/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Last week' }));

    expect(namesOnPage()).toEqual(['Curator 1', 'Curator 2', 'Curator 3', 'Curator 4', 'Curator 5']);
  });
});

describe('CuratorLeaderboardSection', () => {
  it("links a curator's name to their space home", () => {
    renderSection(result([row()]));

    expect(screen.getByRole('link', { name: 'Ada' }).getAttribute('href')).toBe(`/space/${CURATOR_SPACE_ID}`);
  });

  it("links the viewer's own row, which renders as You", () => {
    renderSection(result([], row({ curatorSpaceId: VIEWER_SPACE_ID, name: 'Grace', isCurrentUser: true, rank: 7 })));

    expect(screen.getByRole('link', { name: 'You' }).getAttribute('href')).toBe(`/space/${VIEWER_SPACE_ID}`);
  });

  it('says when the counts are a truncated prefix, not a complete total', () => {
    renderSection({ ...result([row()]), truncated: true });

    expect(screen.getByText('Some activity was not included in these counts.')).toBeTruthy();
  });
});
