import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpaceMembersJoinButton } from './space-members-join-button';
import { SpaceMembersPopoverMemberRequestButton } from './space-members-popover-members-request-button';

const LINK = 'https://geo.test/space/abc?addBack=member';

const mocks = vi.hoisted(() => ({
  join: vi.fn(),
  lockedOut: { isLockedOut: false } as { isLockedOut: false } | { isLockedOut: true; link: string },
}));

vi.mock('~/core/hooks/use-join-space', () => ({
  useJoinSpace: () => ({ join: mocks.join, status: 'idle', optimisticRequested: false }),
}));
vi.mock('~/core/hooks/use-pending-memberships', () => ({ useIsMembershipPending: () => false }));
vi.mock('~/core/hooks/use-locked-out-of-space', () => ({ useLockedOutOfSpace: () => mocks.lockedOut }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lockedOut = { isLockedOut: false };
});
afterEach(cleanup);

describe.each([
  ['header Join button', SpaceMembersJoinButton, 'Join'],
  ['members popover request button', SpaceMembersPopoverMemberRequestButton, 'Request to join'],
])('%s', (_name, Component, joinLabel) => {
  it('requests membership for someone who can join', async () => {
    render(<Component spaceId="space" memberRequest={null} />);
    await userEvent.setup().click(screen.getByRole('button', { name: joinLabel }));
    expect(mocks.join).toHaveBeenCalledOnce();
  });

  // The contract refuses their request, so offering Join only ever ended in "RPC Request failed".
  it('shows someone locked out what to do and the link for an editor, never sending a request', async () => {
    mocks.lockedOut = { isLockedOut: true, link: LINK };
    render(<Component spaceId="space" memberRequest={null} />);

    expect(screen.queryByRole('button', { name: joinLabel })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ask an editor' }));

    expect(screen.getByText(/so it can't accept a join request from you/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Link for an editor' })).toHaveValue(LINK);
    expect(mocks.join).not.toHaveBeenCalled();
  });
});
