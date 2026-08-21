import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EASY_DIFFICULTY_ID, HARD_DIFFICULTY_ID } from '~/core/bounties/ontology';
import { BOUNTY_STATUS_DONE_ID, BOUNTY_STATUS_TODO_ID } from '~/core/bounties/ontology';
import type { BoardBounty } from '~/core/bounties/types';

import { BountyBoard, collectSkills } from './bounty-board';

const mocks = vi.hoisted(() => ({
  replaceState: vi.fn(),
  pathname: '/bounties',
  search: '',
  query: {
    data: undefined as { bounties: BoardBounty[]; spaces: { id: string; label: string; image: string }[] } | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  lastSpaceIds: [] as readonly string[],
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('~/core/bounties/use-bounties', () => ({
  useBoardBounties: (spaceIds: readonly string[]) => {
    mocks.lastSpaceIds = spaceIds;
    return mocks.query;
  },
}));

vi.mock('~/core/bounties/constants', () => ({
  CURRENT_BOUNTY_SPACE_IDS: ['space-a', 'space-b'],
}));

vi.mock('~/partials/community-tab/bounty-card', () => ({
  CARD_WIDTH_PX: 249,
  COMPLETED_CARD_HEIGHT_PX: 143,
  IN_PROGRESS_CARD_HEIGHT_PX: 110,
  AVAILABLE_CARD_WIDTH_PX: 378,
  AVAILABLE_CARD_HEIGHT_PX: 240,
  BountyCard: ({ bounty }: { bounty: { name: string } }) => <div data-card="completed">{bounty.name}</div>,
  InProgressBountyCard: ({ bounty }: { bounty: { name: string } }) => <div data-card="in-progress">{bounty.name}</div>,
  AvailableBountyCard: ({ bounty }: { bounty: { name: string } }) => <div data-card="available">{bounty.name}</div>,
}));

vi.mock('~/core/community/use-interested-in-bounty', () => ({
  useInterestedBountyIds: () => ({ interestedIds: new Set<string>(), isLoading: false }),
  useInterestedInBounty: () => ({ registerInterest: vi.fn(), pendingBountyId: null, canRegisterInterest: true }),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

function bounty(overrides: Partial<BoardBounty> & { id: string }): BoardBounty {
  return {
    spaceId: 'space-a',
    spaceLabel: 'Space A',
    spaceImage: null,
    name: overrides.id,
    description: null,
    budget: 100,
    difficulty: null,
    difficultyId: null,
    status: 'Backlog',
    statusId: null,
    deadline: null,
    skills: [],
    maintainers: [],
    allocatedIds: [],
    interestedCount: 0,
    updatedAt: null,
    isFeatured: false,
    contributors: [],
    ...overrides,
  };
}

const spaces = [
  { id: 'space-a', label: 'Space A', image: '' },
  { id: 'space-b', label: 'Space B', image: '' },
];

beforeEach(() => {
  mocks.replaceState.mockReset();
  // Filter writes are shallow history updates, not router navigations.
  vi.stubGlobal('history', { ...window.history, replaceState: mocks.replaceState, state: null });
  mocks.pathname = '/bounties';
  mocks.search = '';
  mocks.query = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
});

afterEach(cleanup);

describe('collectSkills', () => {
  it('dedupes skills across bounties and sorts by name', () => {
    const result = collectSkills([
      bounty({ id: 'a', skills: [{ id: 's2', name: 'Zoology' }] }),
      bounty({
        id: 'b',
        skills: [
          { id: 's1', name: 'Anatomy' },
          { id: 's2', name: 'Zoology' },
        ],
      }),
    ]);
    expect(result).toEqual([
      { id: 's1', name: 'Anatomy' },
      { id: 's2', name: 'Zoology' },
    ]);
  });
});

describe('BountyBoard', () => {
  it('shows a skeleton while loading and an error state with retry', () => {
    mocks.query = { ...mocks.query, isLoading: true };
    const { unmount } = render(<BountyBoard />);
    expect(screen.getByTestId('bounty-board').querySelector('[aria-busy]')).toBeTruthy();
    unmount();

    mocks.query = { ...mocks.query, isLoading: false, isError: true };
    render(<BountyBoard />);
    fireEvent.click(screen.getByText('Try again'));
    expect(mocks.query.refetch).toHaveBeenCalled();
  });

  it('renders open bounties by default and hides Done ones', () => {
    mocks.query.data = {
      bounties: [
        bounty({ id: 'open', name: 'Open bounty', statusId: BOUNTY_STATUS_TODO_ID }),
        bounty({ id: 'done', name: 'Done bounty', statusId: BOUNTY_STATUS_DONE_ID }),
      ],
      spaces,
    };
    render(<BountyBoard />);
    expect(screen.getByText('Open bounty')).toBeInTheDocument();
    expect(screen.queryByText('Done bounty')).not.toBeInTheDocument();
    expect(mocks.lastSpaceIds).toEqual(['space-a', 'space-b']);
  });

  it('applies filters from the URL and groups when asked', () => {
    mocks.search = 'difficulty=hard&groupBy=space';
    mocks.query.data = {
      bounties: [
        bounty({ id: 'hard-a', name: 'Hard A', difficultyId: HARD_DIFFICULTY_ID, difficulty: 'Hard' }),
        bounty({
          id: 'hard-b',
          name: 'Hard B',
          difficultyId: HARD_DIFFICULTY_ID,
          difficulty: 'Hard',
          spaceId: 'space-b',
          spaceLabel: 'Space B',
        }),
        bounty({ id: 'easy', name: 'Easy one', difficultyId: EASY_DIFFICULTY_ID, difficulty: 'Easy' }),
      ],
      spaces,
    };
    render(<BountyBoard />);
    expect(screen.queryByText('Easy one')).not.toBeInTheDocument();
    const sectionA = screen.getByRole('region', { name: 'Space A' });
    const sectionB = screen.getByRole('region', { name: 'Space B' });
    expect(within(sectionA).getByText('Hard A')).toBeInTheDocument();
    expect(within(sectionB).getByText('Hard B')).toBeInTheDocument();
  });

  it('writes filter changes back to the URL with router.replace', () => {
    mocks.query.data = {
      bounties: [bounty({ id: 'x', difficultyId: HARD_DIFFICULTY_ID, difficulty: 'Hard' })],
      spaces,
    };
    render(<BountyBoard />);
    fireEvent.click(screen.getByRole('button', { name: /Any difficulty/ }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Hard/ }));
    expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/bounties?difficulty=hard');
  });

  it('shows result counts next to options, orders by count, and disables zero-count options', () => {
    mocks.query.data = {
      bounties: [
        bounty({ id: 'h1', difficultyId: HARD_DIFFICULTY_ID, difficulty: 'Hard' }),
        bounty({ id: 'h2', difficultyId: HARD_DIFFICULTY_ID, difficulty: 'Hard' }),
        bounty({ id: 'e1', difficultyId: EASY_DIFFICULTY_ID, difficulty: 'Easy' }),
      ],
      spaces,
    };
    render(<BountyBoard />);
    fireEvent.click(screen.getByRole('button', { name: /Any difficulty/ }));
    const rows = screen
      .getAllByRole('menuitemcheckbox')
      .filter(el => !/Any difficulty/.test(el.textContent ?? ''))
      .map(el => el.textContent);
    // Hard (2) first, then Easy (1), then Medium (0) last and disabled.
    expect(rows).toEqual(['Hard2', 'Easy1', 'Medium0']);
    expect(screen.getByRole('menuitemcheckbox', { name: /Medium/ })).toBeDisabled();
  });

  it('filtering updates the visible bounties immediately, without any router round trip', () => {
    // useSearchParams is static in this test — like the real app, where the
    // shallow URL mirror never re-renders the tree. The list must still update.
    mocks.query.data = {
      bounties: [
        bounty({ id: 'hard', name: 'Hard one', difficultyId: HARD_DIFFICULTY_ID, difficulty: 'Hard' }),
        bounty({ id: 'easy', name: 'Easy one', difficultyId: EASY_DIFFICULTY_ID, difficulty: 'Easy' }),
      ],
      spaces,
    };
    render(<BountyBoard />);
    expect(screen.getByText('Easy one')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Any difficulty/ }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Hard/ }));
    expect(screen.queryByText('Easy one')).not.toBeInTheDocument();
    expect(screen.getByText('Hard one')).toBeInTheDocument();
  });

  it('space filter is multi-select and writes a comma list; sort and group sit in the view-options cluster', () => {
    mocks.search = 'space=space-a';
    mocks.query.data = {
      bounties: [bounty({ id: 'a' }), bounty({ id: 'b', spaceId: 'space-b', spaceLabel: 'Space B' })],
      spaces,
    };
    render(<BountyBoard />);
    // Only the space-a bounty passes the filter.
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.queryByText('b')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Space A/ }));
    const spaceB = screen.getByRole('menuitemcheckbox', { name: /Space B/ });
    expect(spaceB).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(spaceB);
    expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/bounties?space=space-a%2Cspace-b');

    // Sorting and grouping are visually separated from the filters.
    const viewOptions = screen.getByTestId('bounty-view-options');
    expect(within(viewOptions).getByRole('button', { name: /Recently updated/ })).toBeInTheDocument();
    expect(within(viewOptions).getByRole('button', { name: /No grouping/ })).toBeInTheDocument();
    expect(within(screen.getByTestId('bounty-filters')).queryByRole('button', { name: /Recently updated/ })).toBeNull();
  });

  it('Featured is a checkbox: toggling on writes the scope param, the All row clears it', () => {
    mocks.query.data = { bounties: [bounty({ id: 'a', isFeatured: true }), bounty({ id: 'b' })], spaces };
    render(<BountyBoard />);
    fireEvent.click(screen.getByRole('button', { name: /^All$/ }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Featured/ }));
    expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/bounties?scope=featured');
  });

  it('shows the empty-state copy that matches whether anything loaded at all', () => {
    mocks.query.data = { bounties: [], spaces };
    const { unmount } = render(<BountyBoard />);
    expect(screen.getByText('No bounties yet.')).toBeInTheDocument();
    unmount();

    mocks.search = 'q=zzz';
    mocks.query.data = { bounties: [bounty({ id: 'x' })], spaces };
    render(<BountyBoard />);
    expect(screen.getByText('No bounties match these filters.')).toBeInTheDocument();
  });
});

describe('BountyBoard status filter', () => {
  it('shows which statuses are selected (with counts) and toggles them without closing the menu', () => {
    mocks.query.data = {
      bounties: [bounty({ id: 'x' }), bounty({ id: 'd', statusId: BOUNTY_STATUS_DONE_ID })],
      spaces,
    };
    render(<BountyBoard />);
    fireEvent.click(screen.getByRole('button', { name: /^Open/ }));
    const rows = screen.getAllByRole('menuitemcheckbox').filter(el => !/All statuses/.test(el.textContent ?? ''));
    // Ordered by count (Backlog and Done have one each), then label; the default open set is checked.
    expect(rows.map(el => `${el.textContent}:${el.getAttribute('aria-checked')}`)).toEqual([
      'Backlog1:true',
      'Done1:false',
      'Cancelled0:false',
      'In progress0:true',
      'In review0:true',
      'To do0:true',
    ]);
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Done/ }));
    // Menu stays open (multi-select) and the URL now carries the explicit set.
    expect(screen.getByRole('menuitemcheckbox', { name: /Done/ })).toBeInTheDocument();
    expect(mocks.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/bounties?status=backlog%2Ctodo%2Cin-progress%2Cin-review%2Cdone'
    );
  });
});
