import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BountyDetail } from '~/core/bounties/fetch-bounty-detail';
import type { BountyRoles } from '~/core/bounties/use-bounty-roles';

import { BountyAllocationTabs } from './bounty-allocation-tabs';

const mocks = vi.hoisted(() => ({
  allocate: vi.fn(async () => true),
  remove: vi.fn(async () => true),
  pendingTargetId: null as string | null,
  names: new Map<string, string | null>([
    ['aaaa0000000000000000000000000001', 'Alice'],
    ['bbbb0000000000000000000000000002', 'Bob'],
  ]),
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
});
