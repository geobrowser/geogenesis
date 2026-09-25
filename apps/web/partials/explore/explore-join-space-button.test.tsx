import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExploreJoinSpaceButton } from './explore-join-space-button';

const mocks = vi.hoisted(() => ({
  promptSignIn: vi.fn(),
  deferJoin: vi.fn(),
  requestToBeMember: vi.fn(),
  enqueuePendingAction: vi.fn(),
  smartAccount: null as unknown,
  personalSpace: { personalSpaceId: null as string | null, isRegistered: false },
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.promptSignIn }));
vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: mocks.smartAccount }) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => mocks.personalSpace }));
vi.mock('~/core/hooks/use-pending-memberships', () => ({ useIsMembershipPending: () => false }));
vi.mock('~/core/hooks/use-request-to-be-member', () => ({
  useRequestToBeMember: () => ({
    requestToBeMember: mocks.requestToBeMember,
    requestToBeMemberAsync: vi.fn(),
    status: 'idle' as const,
  }),
}));
vi.mock('~/core/state/pending-actions', () => ({ useEnqueuePendingAction: () => mocks.enqueuePendingAction }));
vi.mock('~/core/state/pending-join-intents', () => ({ useDeferredJoin: () => mocks.deferJoin }));

beforeEach(() => {
  mocks.promptSignIn.mockClear();
  mocks.deferJoin.mockClear();
  mocks.requestToBeMember.mockClear();
  mocks.smartAccount = null;
  mocks.personalSpace = { personalSpaceId: null, isRegistered: false };
});

afterEach(cleanup);

describe('ExploreJoinSpaceButton', () => {
  // The interstitial "Create your personal space to join spaces" card used to sit here, costing a
  // second click to reach the same Privy dialog. Pressing Join while signed out goes straight to
  // Privy now, and the join intent is still parked so it fires once the account exists.
  it('opens Privy directly when signed out, after parking the join intent', () => {
    render(<ExploreJoinSpaceButton spaceId="space-1" hasRequestedSpaceMembership={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Join space' }));

    expect(mocks.deferJoin).toHaveBeenCalledTimes(1);
    expect(mocks.promptSignIn).toHaveBeenCalledTimes(1);
    expect(mocks.requestToBeMember).not.toHaveBeenCalled();
  });

  it('requests membership without any sign-in prompt once the personal space is live', () => {
    mocks.smartAccount = { account: { address: '0xabc' } };
    mocks.personalSpace = { personalSpaceId: 'personal-1', isRegistered: true };

    render(<ExploreJoinSpaceButton spaceId="space-1" hasRequestedSpaceMembership={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Join space' }));

    expect(mocks.requestToBeMember).toHaveBeenCalledTimes(1);
    expect(mocks.promptSignIn).not.toHaveBeenCalled();
  });
});
