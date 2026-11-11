import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpaceMembersJoinButton } from './space-members-join-button';

const mocks = vi.hoisted(() => ({
  join: vi.fn(),
  isLockedOut: false,
  copied: false,
  copy: vi.fn(),
}));

vi.mock('~/core/hooks/use-join-space', () => ({
  useJoinSpace: () => ({ join: mocks.join, status: 'idle', optimisticRequested: false }),
}));
vi.mock('~/core/hooks/use-pending-memberships', () => ({ useIsMembershipPending: () => false }));
vi.mock('~/core/hooks/use-locked-out-of-space', () => ({
  useLockedOutOfSpace: () => ({ isLockedOut: mocks.isLockedOut, copied: mocks.copied, copyAddBackLink: mocks.copy }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isLockedOut = false;
  mocks.copied = false;
});
afterEach(cleanup);

describe('SpaceMembersJoinButton', () => {
  it('requests membership for someone who can join', async () => {
    render(<SpaceMembersJoinButton spaceId="space" memberRequest={null} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Join' }));
    expect(mocks.join).toHaveBeenCalledOnce();
  });

  // The contract refuses their request, so offering Join only ever ended in "RPC Request failed".
  it('hands someone locked out a link for an editor instead of a request that cannot go through', async () => {
    mocks.isLockedOut = true;
    render(<SpaceMembersJoinButton spaceId="space" memberRequest={null} />);

    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /Ask an editor/ }));
    expect(mocks.copy).toHaveBeenCalledOnce();
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it('confirms the link was copied', () => {
    mocks.isLockedOut = true;
    mocks.copied = true;
    render(<SpaceMembersJoinButton spaceId="space" memberRequest={null} />);
    expect(screen.getByText('Link copied')).toBeInTheDocument();
  });
});
