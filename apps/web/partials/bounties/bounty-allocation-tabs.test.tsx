import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BountyDetail } from '~/core/bounties/fetch-bounty-detail';
import type { BountyRoles } from '~/core/bounties/use-bounty-roles';
import type { PendingPayout } from '~/core/bounties/use-direct-payout';

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
  // Ids the graph knows as PERSONAL spaces (besides any a person resolves to).
  personalSpaces: new Set(['aaaa0000000000000000000000000001', 'bbbb0000000000000000000000000002']),
  lookupFails: false,
  pendingPayout: null as PendingPayout | null,
  searchPick: null as { spaceId: string; personId: string; name: string | null } | null,
}));

vi.mock('~/core/bounties/use-direct-payout', () => ({
  useDirectPayout: () => ({ pay: mocks.pay, finish: vi.fn(), pendingPayout: mocks.pendingPayout, busy: false }),
  useSpaceBalance: () => ({ data: 6880, isLoading: false }),
}));
vi.mock('~/core/io/subgraph/fetch-personal-spaces-by-page-ids', () => ({
  fetchPersonalSpacesByPageIds: async (ids: string[]) => {
    if (mocks.lookupFails) throw new Error('graph down');
    return new Map(ids.flatMap(id => (mocks.spaceByPerson.has(id) ? [[id, mocks.spaceByPerson.get(id)!]] : [])));
  },
}));
vi.mock('~/core/io/subgraph/fetch-personal-space-ids', () => ({
  fetchPersonalSpaceIds: async (ids: string[]) => {
    const known = new Set([...mocks.personalSpaces, ...mocks.spaceByPerson.values()]);
    return new Set(ids.filter(id => known.has(id)));
  },
}));
vi.mock('./curator-search', () => ({
  CuratorSearch: ({
    onSelect,
    placeholder,
  }: {
    onSelect: (c: { spaceId: string; personId: string; name: string | null }) => void;
    placeholder: string;
  }) => (
    <button type="button" onClick={() => mocks.searchPick && onSelect(mocks.searchPick)}>
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
  mocks.lookupFails = false;
  mocks.personalSpaces = new Set([ALICE, BOB]);
  mocks.pendingPayout = null;
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

  it('gives editors Remove on allocated and Allocate on interested-but-unallocated', async () => {
    render(<BountyAllocationTabs detail={detail} roles={{ ...viewer, isEditor: true }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mocks.remove).toHaveBeenCalledWith({ id: ALICE, targetIds: [ALICE] });
    expect(screen.getByRole('button', { name: 'Pay' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Interested/ }));
    const allocateButtons = screen.getAllByRole('button', { name: 'Allocate' });
    expect(allocateButtons).toHaveLength(1);
    // Allocate waits for the person → space lookup, so it can't duplicate an allocation.
    await waitFor(() => expect(allocateButtons[0]).toBeEnabled());
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

  it('allocates a curator picked by name to their personal space, without an Interested click', async () => {
    const DANA_SPACE = 'dddd0000000000000000000000000044';
    mocks.searchPick = { spaceId: DANA_SPACE, personId: 'dddd00000000000000000000000000d4', name: 'Dana' };
    render(<BountyAllocationTabs detail={detail} roles={{ ...viewer, isEditor: true }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Allocate a curator by name…' }));
    await waitFor(() => expect(mocks.allocate).toHaveBeenCalledWith({ spaceId: DANA_SPACE, name: 'Dana' }));
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

  it('keeps Pay disabled when the person-to-space lookup fails, rather than paying a person entity', async () => {
    mocks.lookupFails = true;
    render(<BountyAllocationTabs detail={detail} roles={{ ...viewer, isEditor: true }} />);
    // Let the failed lookup settle; Pay must never enable.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getByRole('button', { name: 'Pay' })).toBeDisabled();
  });

  // Live shape on "The ranked 25": curator-app allocated the person entity, Geo recorded
  // interest from the personal space. Both must read as one curator.
  it('treats a person-allocated curator with space-shaped interest as one allocated curator', async () => {
    const PERSON = 'eeee00000000000000000000000000e5';
    const PERSON_SPACE = 'ffff00000000000000000000000000f6';
    mocks.spaceByPerson = new Map([[PERSON, PERSON_SPACE]]);
    mocks.names.set(PERSON, 'Ali');
    const mixed: BountyDetail = {
      ...detail,
      bounty: { ...detail.bounty, allocatedIds: [PERSON] },
      interest: [{ id: 'i-ali', fromEntityId: PERSON, spaceId: PERSON_SPACE }],
    };
    render(<BountyAllocationTabs detail={mixed} roles={{ ...viewer, isEditor: true }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pay' })).toBeEnabled());
    expect(screen.getAllByTestId('curator-row')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Pay' })).toHaveLength(1);
    expect(screen.getByText('Ali')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Interested/ }));
    const rows = screen.getAllByTestId('curator-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('Allocated')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allocate' })).not.toBeInTheDocument();

    // Remove still tombstones the person-shaped row it was actually allocated under.
    fireEvent.click(screen.getByRole('tab', { name: /Allocated/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mocks.remove).toHaveBeenCalledWith({ id: PERSON_SPACE, targetIds: [PERSON] });
  });

  it('pays the personal space once for a curator allocated under both identities', async () => {
    const PERSON = 'eeee00000000000000000000000000e5';
    const PERSON_SPACE = 'ffff00000000000000000000000000f6';
    mocks.spaceByPerson = new Map([[PERSON, PERSON_SPACE]]);
    const both = { ...detail, bounty: { ...detail.bounty, allocatedIds: [PERSON, PERSON_SPACE] } };
    render(<BountyAllocationTabs detail={both} roles={{ ...viewer, isEditor: true }} />);
    await waitFor(() => expect(screen.getAllByTestId('curator-row')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mocks.remove).toHaveBeenCalledWith({ id: PERSON_SPACE, targetIds: [PERSON, PERSON_SPACE] });
  });

  it('offers to finish a payout a previous visit left unfinished', async () => {
    mocks.pendingPayout = {
      stage: 'publish',
      payoutRelationId: 'p1',
      recipient: { spaceId: BOB, name: 'Bob' },
      amount: 250,
      values: [],
      relations: [],
    };
    render(<BountyAllocationTabs detail={detail} roles={{ ...viewer, isEditor: true }} />);
    expect(screen.getByTestId('pending-payout-notice')).toHaveTextContent(
      "250 points were paid to Bob, but the payout record isn't published yet."
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish payout' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent("won't pay twice");
  });

  // A curator-app allocation to a person who has no personal space: the graph knows the id
  // as neither a space nor a space's page. It must not be paid as a person entity.
  it('will not pay or allocate a curator whose id is not a personal space and fronts none', async () => {
    const NO_SPACE = 'cccc00000000000000000000000000c3';
    mocks.names.set(NO_SPACE, 'Pat');
    const orphan: BountyDetail = {
      ...detail,
      bounty: { ...detail.bounty, allocatedIds: [ALICE, NO_SPACE] },
      interest: [{ id: 'i-pat', fromEntityId: NO_SPACE, spaceId: 's' }],
    };
    render(<BountyAllocationTabs detail={orphan} roles={{ ...viewer, isEditor: true }} />);
    expect(await screen.findByText("No personal space, so they can't be paid or allocated here.")).toBeInTheDocument();

    const rows = screen.getAllByTestId('curator-row');
    const patRow = rows.find(row => within(row).queryByText('Pat'))!;
    const aliceRow = rows.find(row => within(row).queryByText('Alice'))!;
    expect(within(patRow).getByRole('button', { name: 'Pay' })).toBeDisabled();
    expect(within(aliceRow).getByRole('button', { name: 'Pay' })).toBeEnabled();
    // Remove still works, so the row can be cleaned up.
    fireEvent.click(within(patRow).getByRole('button', { name: 'Remove' }));
    expect(mocks.remove).toHaveBeenCalledWith({ id: NO_SPACE, targetIds: [NO_SPACE] });

    // Interest written from inside the bounty space by that person can't be allocated either.
    fireEvent.click(screen.getByRole('tab', { name: /Interested/ }));
    const interestRow = screen.getAllByTestId('curator-row').find(row => within(row).queryByText('Pat'))!;
    expect(within(interestRow).queryByRole('button', { name: 'Allocate' })).toBeNull();
    expect(within(interestRow).getByText('Allocated')).toBeInTheDocument();
  });

  it('will not allocate an interested person who has no personal space', async () => {
    const NO_SPACE = 'cccc00000000000000000000000000c3';
    mocks.names.set(NO_SPACE, 'Pat');
    const interestedOnly: BountyDetail = {
      ...detail,
      // Legacy interest written into the bounty's own space from a person entity.
      interest: [...detail.interest, { id: 'i-pat', fromEntityId: NO_SPACE, spaceId: 's' }],
    };
    render(<BountyAllocationTabs detail={interestedOnly} roles={{ ...viewer, isEditor: true }} />);
    fireEvent.click(screen.getByRole('tab', { name: /Interested/ }));
    await screen.findByText("No personal space, so they can't be paid or allocated here.");
    const rows = screen.getAllByTestId('curator-row');
    const patRow = rows.find(row => within(row).queryByText('Pat'))!;
    const bobRow = rows.find(row => within(row).queryByText('Bob'))!;
    expect(within(patRow).getByRole('button', { name: 'Allocate' })).toBeDisabled();
    expect(within(bobRow).getByRole('button', { name: 'Allocate' })).toBeEnabled();
  });
});
