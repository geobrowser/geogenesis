import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BountyDetail } from '~/core/bounties/fetch-bounty-detail';
import type { BountyRoles } from '~/core/bounties/use-bounty-roles';

import { BountyInterestCard, resolveInterestCardState } from './bounty-interest-card';

const mocks = vi.hoisted(() => ({
  actions: {
    pending: false,
    error: null as string | null,
    expressInterest: vi.fn(async () => true),
    cancelInterest: vi.fn(async () => true),
  },
}));

vi.mock('~/core/bounties/use-bounty-actions', () => ({
  useBountyInterestActions: () => mocks.actions,
}));

function detail(overrides: Partial<BountyDetail['bounty']> = {}): BountyDetail {
  return {
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
      allocatedIds: [],
      interestedCount: 0,
      updatedAt: null,
      maxContributors: null,
      ...overrides,
    },
    interest: [],
    submissions: [],
    allocationRelations: [],
  };
}

function roles(overrides: Partial<BountyRoles> = {}): BountyRoles {
  return {
    personId: 'p',
    personalSpaceId: 'ps',
    isSignedIn: true,
    isEditor: false,
    isMaintainer: false,
    isAllocated: false,
    isInterested: false,
    ownInterestRows: [],
    isLoading: false,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.actions.expressInterest.mockClear();
  mocks.actions.cancelInterest.mockClear();
  mocks.actions.pending = false;
  mocks.actions.error = null;
});
afterEach(cleanup);

describe('resolveInterestCardState', () => {
  const now = Date.parse('2026-08-14T00:00:00Z');
  it('walks the priority order: allocated > ended > signed-out > no space > interested > filled > apply', () => {
    expect(resolveInterestCardState(detail(), roles({ isAllocated: true, isSignedIn: false }), now)).toBe('allocated');
    expect(resolveInterestCardState(detail({ deadline: '2020-01-01T00:00:00Z' }), roles(), now)).toBe('ended');
    expect(resolveInterestCardState(detail(), roles({ isSignedIn: false }), now)).toBe('signed-out');
    expect(resolveInterestCardState(detail(), roles({ personalSpaceId: null }), now)).toBe('no-personal-space');
    expect(resolveInterestCardState(detail(), roles({ isInterested: true }), now)).toBe('interested');
    expect(resolveInterestCardState(detail({ maxContributors: 1, allocatedIds: ['x'] }), roles(), now)).toBe(
      'spots-filled'
    );
    expect(resolveInterestCardState(detail({ maxContributors: 2, allocatedIds: ['x'] }), roles(), now)).toBe(
      'can-apply'
    );
    expect(resolveInterestCardState(detail(), roles(), now)).toBe('can-apply');
  });
});

describe('BountyInterestCard', () => {
  it('offers "I\'m interested" and calls expressInterest', () => {
    render(<BountyInterestCard detail={detail()} roles={roles()} />);
    fireEvent.click(screen.getByRole('button', { name: "I'm interested" }));
    expect(mocks.actions.expressInterest).toHaveBeenCalled();
  });

  it('offers cancel while in review', () => {
    render(<BountyInterestCard detail={detail()} roles={roles({ isInterested: true })} />);
    expect(screen.getByText('Application in review')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel interest' }));
    expect(mocks.actions.cancelInterest).toHaveBeenCalled();
  });

  it('shows no action for allocated / filled / ended / signed-out states', () => {
    for (const r of [roles({ isAllocated: true }), roles({ isSignedIn: false })]) {
      const { unmount } = render(<BountyInterestCard detail={detail()} roles={r} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      unmount();
    }
    const { unmount } = render(
      <BountyInterestCard detail={detail({ deadline: '2020-01-01T00:00:00Z' })} roles={roles()} />
    );
    expect(screen.getByText('This bounty has ended')).toBeInTheDocument();
    unmount();
    render(<BountyInterestCard detail={detail({ maxContributors: 1, allocatedIds: ['x'] })} roles={roles()} />);
    expect(screen.getByText('All allocated spots are filled')).toBeInTheDocument();
  });

  it('lets editors apply too (curator-app shows the card to everyone), and shows action errors', () => {
    const { unmount } = render(<BountyInterestCard detail={detail()} roles={roles({ isEditor: true })} />);
    expect(screen.getByRole('button', { name: "I'm interested" })).toBeInTheDocument();
    unmount();
    mocks.actions.error = 'Could not record your interest.';
    render(<BountyInterestCard detail={detail()} roles={roles()} />);
    expect(screen.getByText('Could not record your interest.')).toBeInTheDocument();
  });
});
