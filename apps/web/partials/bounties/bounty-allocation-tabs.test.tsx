import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BountyDetail } from '~/core/bounties/fetch-bounty-detail';
import type { BountyRoles } from '~/core/bounties/use-bounty-roles';

import { BountyAllocationTabs as Tabs } from './bounty-allocation-tabs';

function BountyAllocationTabs(props: React.ComponentProps<typeof Tabs>) {
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <Tabs {...props} />
    </QueryClientProvider>
  );
}

const mocks = vi.hoisted(() => ({
  allocate: vi.fn(async () => true),
  remove: vi.fn(async () => true),
  pendingTargetId: null as string | null,
  names: new Map<string, string | null>([
    ['aaaa0000000000000000000000000001', 'Alice'],
    ['bbbb0000000000000000000000000002', 'Bob'],
  ]),
  pay: vi.fn(async () => ({ status: 'paid' as const })),
  // Person entity → personal space, as the graph resolves pages to spaces.
  spaceByPerson: new Map<string, string>(),
  searchPick: null as { id: string; name: string | null } | null,
}));

vi.mock('~/core/bounties/use-direct-payout', () => ({
  useDirectPayout: () => ({ pay: mocks.pay, retryCredit: vi.fn(), pendingCredit: null, busy: false }),
  useSpaceBalance: () => ({ data: 6880, isLoading: false }),
}));
vi.mock('~/core/io/subgraph/fetch-personal-spaces-by-page-ids', () => ({
  fetchPersonalSpacesByPageIds: async (ids: string[]) =>
    new Map(ids.flatMap(id => (mocks.spaceByPerson.has(id) ? [[id, mocks.spaceByPerson.get(id)!]] : []))),
}));
vi.mock('~/design-system/select-entity-compact', () => ({
  SelectEntityCompact: ({
    onDone,
    placeholder,
  }: {
    onDone: (r: { id: string; name: string | null }) => void;
    placeholder?: string;
  }) => (
    <button type="button" onClick={() => mocks.searchPick && onDone(mocks.searchPick)}>
      {placeholder}
    </button>
  ),
}));

vi.mock('~/core/bounties/use-bounty-actions', () => ({
  useBountyAllocationActions: () => ({
    allocate: mocks.allocate,
    remove: mocks.remove,
    pendingTargetId: mocks.pendingTargetId,
  }),
}));
vi.mock('~/core/bounties/use-entity-names', () => ({
  useEntityNames: () => ({ data: mocks.names }),
}));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href, ...rest }: React.ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Identities are personal space ids — the system-entity shape both the
// interest and allocation writers use.
const ALICE = 'aaaa0000000000000000000000000001';
const BOB = 'bbbb0000000000000000000000000002';

const detail: BountyDetail = {
  bounty: {
    id: 'b',
    spaceId: 's',
    name: 'Bounty',
    description: null,
    budget: null,
    difficulty: null,
    difficultyId: null,
    status: null,
    statusId: null,
    deadline: null,
    skills: [],
    maintainers: [],
    allocatedIds: [ALICE],
    interestedCount: 2,
    updatedAt: null,
    isFeatured: false,
    contributors: [],
    maxContributors: 2,
  },
  interest: [
    // New shape: authored in the curator's personal space from its system entity.
    { id: 'i1', fromEntityId: ALICE, spaceId: ALICE },
    { id: 'i2', fromEntityId: BOB, spaceId: BOB },
    // A legacy person-entity row for Bob, written in the same personal space — must dedupe.
    { id: 'i3', fromEntityId: 'cccc0000000000000000000000000003', spaceId: BOB },
  ],
  submissions: [],
  allocationRelations: [],
};

const viewer: BountyRoles = {
  personId: null,
  personalSpaceId: null,
  isSignedIn: false,
  isEditor: false,
  isMaintainer: false,
  isAllocated: false,
  isInterested: false,
  ownInterestRows: [],
  isLoading: false,
};

beforeEach(() => {
  mocks.allocate.mockClear();
  mocks.remove.mockClear();
  mocks.pay.mockClear();
  mocks.spaceByPerson = new Map();
  mocks.searchPick = null;
});
afterEach(cleanup);

describe('BountyAllocationTabs', () => {
  it('lists allocated curators by name, then distinct interested ones on the other tab', () => {
    render(<BountyAllocationTabs detail={detail} roles={viewer} />);
    expect(screen.getAllByTestId('curator-row')).toHaveLength(1);
    expect(screen.getByText('Alice')).toHaveAttribute('href', `/space/s/${ALICE}`);
    expect(screen.getByText('1 of 2 spots open')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Interested/ }));
    const rows = screen.getAllByTestId('curator-row');
    // Bob's duplicate interest rows collapse to one.
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Alice')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Allocated')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('gives editors Remove on allocated and Allocate on interested-but-unallocated', () => {
    render(<BountyAllocationTabs detail={detail} roles={{ ...viewer, isEditor: true }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mocks.remove).toHaveBeenCalledWith(ALICE);
    expect(screen.getByRole('button', { name: 'Pay' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Interested/ }));
    const allocateButtons = screen.getAllByRole('button', { name: 'Allocate' });
    expect(allocateButtons).toHaveLength(1);
    fireEvent.click(allocateButtons[0]);
    expect(mocks.allocate).toHaveBeenCalledWith({ spaceId: BOB, name: 'Bob' });
  });

  it('disables Allocate when no spots remain', () => {
    const full = { ...detail, bounty: { ...detail.bounty, maxContributors: 1 } };
    render(<BountyAllocationTabs detail={full} roles={{ ...viewer, isEditor: true }} />);
    fireEvent.click(screen.getByRole('tab', { name: /Interested/ }));
    expect(screen.getByRole('button', { name: 'Allocate' })).toBeDisabled();
  });

  it('pays an allocated curator through the dialog, with their personal space as recipient', async () => {
    render(<BountyAllocationTabs detail={detail} roles={{ ...viewer, isEditor: true }} />);
    // Pay waits for the person → space lookup, so it never pays a person entity by mistake.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pay' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Pay' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Pay Alice');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '300' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(mocks.pay).toHaveBeenCalledWith({ spaceId: ALICE, name: 'Alice' }, 300));
  });

  it("pays a curator-app person allocation to that person's personal space", async () => {
    const PERSON = 'eeee00000000000000000000000000e5';
    const PERSON_SPACE = 'ffff00000000000000000000000000f6';
    mocks.spaceByPerson = new Map([[PERSON, PERSON_SPACE]]);
    mocks.names.set(PERSON, 'Erin');
    const personDetail = { ...detail, bounty: { ...detail.bounty, allocatedIds: [PERSON] } };
    render(<BountyAllocationTabs detail={personDetail} roles={{ ...viewer, isEditor: true }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pay' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Pay' }));
    fireEvent.change(await screen.findByRole('spinbutton'), { target: { value: '10' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(mocks.pay).toHaveBeenCalledWith({ spaceId: PERSON_SPACE, name: 'Erin' }, 10));
  });

  it('allocates a person found by name to their personal space, without an Interested click', async () => {
    const DANA = 'dddd00000000000000000000000000d4';
    const DANA_SPACE = 'dddd0000000000000000000000000044';
    mocks.spaceByPerson = new Map([[DANA, DANA_SPACE]]);
    mocks.searchPick = { id: DANA, name: 'Dana' };
    render(<BountyAllocationTabs detail={detail} roles={{ ...viewer, isEditor: true }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Allocate a curator by name…' }));
    await waitFor(() => expect(mocks.allocate).toHaveBeenCalledWith({ spaceId: DANA_SPACE, name: 'Dana' }));
  });

  it('explains instead of allocating a person with no personal space', async () => {
    mocks.searchPick = { id: 'cccc00000000000000000000000000c3', name: 'Famous Person' };
    render(<BountyAllocationTabs detail={detail} roles={{ ...viewer, isEditor: true }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Allocate a curator by name…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Famous Person has no personal space, so they can't be allocated."
    );
    expect(mocks.allocate).not.toHaveBeenCalled();
  });

  it('does not re-allocate someone already allocated', async () => {
    mocks.spaceByPerson = new Map([['dddd00000000000000000000000000d4', ALICE]]);
    mocks.searchPick = { id: 'dddd00000000000000000000000000d4', name: 'Alice' };
    render(<BountyAllocationTabs detail={detail} roles={{ ...viewer, isEditor: true }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Allocate a curator by name…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Alice is already allocated.');
    expect(mocks.allocate).not.toHaveBeenCalled();
  });

  it('hides Pay and the name search from non-editors, and the search when spots are full', () => {
    render(<BountyAllocationTabs detail={detail} roles={viewer} />);
    expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('allocate-search')).not.toBeInTheDocument();
    cleanup();
    const full = { ...detail, bounty: { ...detail.bounty, maxContributors: 1 } };
    render(<BountyAllocationTabs detail={full} roles={{ ...viewer, isEditor: true }} />);
    expect(screen.queryByTestId('allocate-search')).not.toBeInTheDocument();
  });
});
