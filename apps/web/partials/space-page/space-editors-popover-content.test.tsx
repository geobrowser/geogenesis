import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpaceEditorsContent } from './space-editors-popover-content';

const mocks = vi.hoisted(() => ({ promptSignIn: vi.fn() }));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.promptSignIn }));
vi.mock('~/core/space-members/use-space-participants-infinite', () => ({
  useSpaceParticipantsInfinite: () => ({
    participants: [],
    totalCount: 2,
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useInfiniteScrollSentinel: () => vi.fn(),
}));
vi.mock('./space-editors-popover-editor-request-button', () => ({
  SpaceEditorsPopoverEditorRequestButton: () => <button type="button">Request to be an editor</button>,
}));
vi.mock('./space-member-row', () => ({ MemberRow: () => null }));

afterEach(() => {
  cleanup();
  mocks.promptSignIn.mockClear();
});

const renderContent = (props: { isEditor?: boolean; connectedAddress?: string | null }) =>
  render(
    <SpaceEditorsContent
      spaceId="space-1"
      isEditor={props.isEditor ?? false}
      isMember={false}
      editorRequest={null}
      connectedAddress={props.connectedAddress ?? null}
    />
  );

describe('SpaceEditorsContent footer', () => {
  // It used to be plain text: it named the next step and did nothing when pressed.
  it('opens sign-in from "Sign in to join" when signed out', () => {
    renderContent({});

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to join' }));

    expect(mocks.promptSignIn).toHaveBeenCalledOnce();
  });

  it('offers the editor request once signed in', () => {
    renderContent({ connectedAddress: '0xabc' });

    expect(screen.getByRole('button', { name: 'Request to be an editor' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in to join' })).not.toBeInTheDocument();
  });

  // Editors have nothing to join; this used to render an empty button.
  it('renders no action for an editor', () => {
    renderContent({ isEditor: true, connectedAddress: '0xabc' });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
