import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EASY_DIFFICULTY_ID, HARD_DIFFICULTY_ID } from '~/core/bounties/ontology';
import { BOUNTY_STATUS_DONE_ID, BOUNTY_STATUS_TODO_ID } from '~/core/bounties/ontology';
import type { BoardBounty } from '~/core/bounties/types';

import { BountyBoard, collectSkills } from './bounty-board';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
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
  useRouter: () => ({ replace: mocks.replace }),
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

vi.mock('~/design-system/geo-image', () => ({
  ThumbGeoImage: () => <span data-thumb-image />,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href, ...rest }: React.ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
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
    ...overrides,
  };
}

const spaces = [
  { id: 'space-a', label: 'Space A', image: '' },
  { id: 'space-b', label: 'Space B', image: '' },
];

beforeEach(() => {
  mocks.replace.mockReset();
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
    mocks.query.data = { bounties: [bounty({ id: 'x' })], spaces };
    render(<BountyBoard />);
    fireEvent.click(screen.getByRole('button', { name: /Any difficulty/ }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Hard' }));
    expect(mocks.replace).toHaveBeenCalledWith('/bounties?difficulty=hard', { scroll: false });
  });

  it('pins the space on the space tab: queries only that space and never writes a space param', () => {
    mocks.pathname = '/space/space-b/bounties';
    mocks.search = 'space=space-a';
    mocks.query.data = { bounties: [bounty({ id: 'x', spaceId: 'space-b' })], spaces: [spaces[1]] };
    render(<BountyBoard spaceId="space-b" />);
    expect(mocks.lastSpaceIds).toEqual(['space-b']);
    // The space filter menu is hidden when scoped to one space.
    expect(screen.queryByRole('button', { name: /All spaces/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Any difficulty/ }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Easy' }));
    expect(mocks.replace).toHaveBeenCalledWith('/space/space-b/bounties?difficulty=easy', { scroll: false });
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
