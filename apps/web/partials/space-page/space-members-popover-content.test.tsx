import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpaceMembersContent } from './space-members-popover-content';

const mocks = vi.hoisted(() => ({ leaveSpace: vi.fn(), status: 'idle' }));
vi.mock('~/core/hooks/use-leave-space', () => ({
  useLeaveSpace: () => ({ leaveSpace: mocks.leaveSpace, status: mocks.status }),
}));
vi.mock('~/core/space-members/use-space-participants-infinite', () => ({
  useSpaceParticipantsInfinite: () => ({ participants: [], totalCount: 3 }),
  useInfiniteScrollSentinel: () => ({ current: null }),
}));
vi.mock('./space-member-row', () => ({ MemberRow: () => null }));
vi.mock('./space-members-popover-members-request-button', () => ({
  SpaceMembersPopoverMemberRequestButton: () => <button>Request membership</button>,
}));

const props = { spaceId: 'space', isPublicSpace: true, isMember: true, isEditor: false, memberRequest: null };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = 'idle';
});
afterEach(cleanup);

describe('Leave space', () => {
  it('submits the leave action when a member presses it', async () => {
    render(<SpaceMembersContent {...props} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Leave space' }));
    expect(mocks.leaveSpace).toHaveBeenCalledOnce();
  });

  it.each([
    ['pending', 'Leaving…'],
    ['success', 'Left space'],
  ])('shows %s feedback and prevents another submission', async (status, label) => {
    mocks.status = status;
    render(<SpaceMembersContent {...props} />);
    const button = screen.getByRole('button', { name: label });
    expect(button).toBeDisabled();
    await userEvent.setup().click(button);
    expect(mocks.leaveSpace).not.toHaveBeenCalled();
  });

  it('allows retrying a failed leave', async () => {
    mocks.status = 'error';
    render(<SpaceMembersContent {...props} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Leave space' }));
    expect(mocks.leaveSpace).toHaveBeenCalledOnce();
  });

  it('shows the membership request again once the server reports the member has left', () => {
    const { rerender } = render(<SpaceMembersContent {...props} />);
    rerender(<SpaceMembersContent {...props} isMember={false} />);
    expect(screen.queryByRole('button', { name: 'Leave space' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request membership' })).toBeVisible();
  });

  it.each([{ isMember: false, isEditor: true }, { isPublicSpace: false }])(
    'does not offer member leave to an editor-only viewer or a personal space',
    overrides => {
      render(<SpaceMembersContent {...props} {...overrides} />);
      expect(screen.queryByRole('button', { name: 'Leave space' })).not.toBeInTheDocument();
    }
  );
});
