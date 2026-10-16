import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileActions } from './profile-actions';

const PROFILE_SPACE = '73a82967cb12f604f9589ac4bc8024cb';

const mocks = vi.hoisted(() => ({
  personalSpaceId: null as string | null,
  isLoading: false,
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isLoading: mocks.isLoading }),
}));
vi.mock('~/core/follows/follow-button', () => ({
  FollowButton: (props: { target: { kind: string; id: string; name?: string | null }; variant?: string }) => (
    <button
      type="button"
      data-testid="follow"
      data-kind={props.target.kind}
      data-id={props.target.id}
      data-variant={props.variant}
    >
      Follow {props.target.name}
    </button>
  ),
}));
vi.mock('~/core/debates/profile-debate-button', () => ({
  ProfileDebateButton: () => <button type="button">Request debate</button>,
}));
vi.mock('~/partials/profile/edit-profile-dialog', () => ({ EditProfileDialog: () => null }));
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: () => <div data-testid="votes" />,
}));

beforeEach(() => {
  mocks.personalSpaceId = 'viewer-space';
  mocks.isLoading = false;
});

afterEach(cleanup);

describe('ProfileActions (GEO-3236)', () => {
  it("offers a visitor Follow on the person's space, before Request debate, and no votes", () => {
    render(<ProfileActions spaceId={PROFILE_SPACE} name="Ada Okafor" />);

    const follow = screen.getByTestId('follow');
    expect(follow).toHaveAttribute('data-kind', 'person');
    expect(follow).toHaveAttribute('data-id', PROFILE_SPACE);
    // The white pill: Request debate keeps the black one.
    expect(follow).toHaveAttribute('data-variant', 'secondary');
    expect(follow.compareDocumentPosition(screen.getByText('Request debate')) & 4).toBe(4);
    expect(screen.queryByTestId('votes')).toBeNull();
  });

  it('gives the owner Edit profile and no votes, keeping their own Follow mounted', () => {
    mocks.personalSpaceId = PROFILE_SPACE;
    render(<ProfileActions spaceId={PROFILE_SPACE} />);

    expect(screen.getByText('Edit profile')).toBeInTheDocument();
    expect(screen.queryByTestId('votes')).toBeNull();
    // It draws nothing on your own space (FollowButton's own suite covers that), but must stay
    // mounted: only a mounted Follow can drop a self-follow queued here while signed out.
    expect(screen.getByTestId('follow')).toHaveAttribute('data-id', PROFILE_SPACE);
    expect(screen.queryByText('Request debate')).toBeNull();
  });

  it('offers nothing until it knows whose profile this is', () => {
    mocks.isLoading = true;
    const { container } = render(<ProfileActions spaceId={PROFILE_SPACE} />);

    expect(container).toBeEmptyDOMElement();
  });
});
