import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memberFastPathMock, resetMemberFastPathMock } from '~/core/hooks/use-member-fast-path.mock';

import { MemberFastPathControl } from './member-fast-path-control';

const VIEWER = '11111111111111111111111111111111';
const MEMBER = '22222222222222222222222222222222';

const mocks = vi.hoisted(() => ({
  restriction: { isRestricted: false as boolean | undefined, isLoading: false, isError: false },
  viewer: null as string | null,
}));

vi.mock('~/core/hooks/use-member-fast-path', () => import('~/core/hooks/use-member-fast-path.mock'));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.viewer }),
}));
vi.mock('~/core/hooks/use-fast-path-restricted', () => ({ useFastPathRestriction: () => mocks.restriction }));

const member = { spaceId: 'space', memberSpaceId: MEMBER, canRestrict: true };
const editor = { ...member, canRestrict: false };

beforeEach(() => {
  resetMemberFastPathMock();
  mocks.restriction = { isRestricted: false, isLoading: false, isError: false };
  mocks.viewer = VIEWER;
});
afterEach(cleanup);

describe('MemberFastPathControl', () => {
  it('marks a restricted person as review only and proposes fast path for them', async () => {
    mocks.restriction.isRestricted = true;
    render(<MemberFastPathControl {...member} />);

    expect(screen.getByText('Review only')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Propose fast path' }));
    expect(memberFastPathMock.runs.give_fast_path).toHaveBeenCalledWith(MEMBER);
  });

  // Only a vote can undo it, so a single stray press must not restrict anyone.
  it('asks for a second press before restricting a member immediately', async () => {
    render(<MemberFastPathControl {...member} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Make review only' }));
    expect(memberFastPathMock.runs.make_review_only).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirm review only' }));
    expect(memberFastPathMock.runs.make_review_only).toHaveBeenCalledWith(MEMBER);
  });

  // One editor must not be able to strip the others; a restricted editor can still be promoted.
  it('never offers to restrict an editor, but still offers to promote a restricted one', () => {
    const { container, rerender } = render(<MemberFastPathControl {...editor} />);
    expect(container).toBeEmptyDOMElement();

    mocks.restriction.isRestricted = true;
    rerender(<MemberFastPathControl {...editor} />);
    expect(screen.getByRole('button', { name: 'Propose fast path' })).toBeInTheDocument();
  });

  it.each([
    ['their own row', MEMBER],
    ['their own row in another id format', '22222222-2222-2222-2222-222222222222'],
    ['any row while their own space id is still loading', null],
  ])("doesn't offer an editor anything on %s", (_case, viewer) => {
    mocks.viewer = viewer;
    const { container } = render(<MemberFastPathControl {...member} />);
    expect(container).toBeEmptyDOMElement();
  });

  // Acting on a failed read would send a write that reverts, so no action is offered.
  it('says when access could not be checked instead of guessing', () => {
    mocks.restriction = { isRestricted: undefined, isLoading: false, isError: true };
    render(<MemberFastPathControl {...member} />);

    expect(screen.getByText("Couldn't check access")).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says a fast-path proposal was created rather than claiming access changed', () => {
    mocks.restriction.isRestricted = true;
    memberFastPathMock.status = 'success';
    render(<MemberFastPathControl {...member} />);

    expect(screen.getByRole('button', { name: 'Proposal created' })).toBeDisabled();
  });

  it('renders nothing until the restriction is known', () => {
    mocks.restriction.isLoading = true;
    const { container } = render(<MemberFastPathControl {...member} />);
    expect(container).toBeEmptyDOMElement();
  });
});
