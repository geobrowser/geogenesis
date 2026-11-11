import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memberFastPathMock, resetMemberFastPathMock } from '~/core/hooks/use-member-fast-path.mock';

import { MemberFastPathControl } from './member-fast-path-control';

const mocks = vi.hoisted(() => ({
  restriction: { isRestricted: false as boolean | undefined, isLoading: false, isError: false },
  viewer: 'viewer',
}));

vi.mock('~/core/hooks/use-member-fast-path', () => import('~/core/hooks/use-member-fast-path.mock'));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: { address: '0xdao' } }) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.viewer }),
}));
vi.mock('~/core/hooks/use-fast-path-restricted', () => ({ useFastPathRestriction: () => mocks.restriction }));

const props = { spaceId: 'space', memberSpaceId: 'member' };

beforeEach(() => {
  resetMemberFastPathMock();
  mocks.restriction = { isRestricted: false, isLoading: false, isError: false };
  mocks.viewer = 'viewer';
});
afterEach(cleanup);

describe('MemberFastPathControl', () => {
  it('marks a restricted person as review only and proposes fast path for them', async () => {
    mocks.restriction.isRestricted = true;
    render(<MemberFastPathControl {...props} />);

    expect(screen.getByText('Review only')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Propose fast path' }));
    expect(memberFastPathMock.runs.give_fast_path).toHaveBeenCalledWith('member');
  });

  // Only a vote can undo it, so a single stray press must not restrict anyone.
  it('asks for a second press before restricting someone immediately', async () => {
    render(<MemberFastPathControl {...props} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Make review only' }));
    expect(memberFastPathMock.runs.make_review_only).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirm review only' }));
    expect(memberFastPathMock.runs.make_review_only).toHaveBeenCalledWith('member');
  });

  it("doesn't offer editors a way to restrict themselves", () => {
    mocks.viewer = 'member';
    const { container } = render(<MemberFastPathControl {...props} />);
    expect(container).toBeEmptyDOMElement();
  });

  // Acting on a failed read would send a write that reverts, so no action is offered.
  it('says when access could not be checked instead of guessing', () => {
    mocks.restriction = { isRestricted: undefined, isLoading: false, isError: true };
    render(<MemberFastPathControl {...props} />);

    expect(screen.getByText("Couldn't check access")).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says a fast-path proposal was created rather than claiming access changed', () => {
    mocks.restriction.isRestricted = true;
    memberFastPathMock.status = 'success';
    render(<MemberFastPathControl {...props} />);

    expect(screen.getByRole('button', { name: 'Proposal created' })).toBeDisabled();
  });

  it('renders nothing until the restriction is known', () => {
    mocks.restriction.isLoading = true;
    const { container } = render(<MemberFastPathControl {...props} />);
    expect(container).toBeEmptyDOMElement();
  });
});
