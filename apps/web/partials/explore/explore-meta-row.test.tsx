import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedItem } from '~/core/explore/explore-card-item';

import { ExploreMetaRow } from './explore-meta-row';

const SPACE = '73a82967cb12f604f9589ac4bc8024cb';

const mocks = vi.hoisted(() => ({
  spaceType: undefined as 'PERSONAL' | 'PUBLIC' | undefined,
  viewerSpace: null as string | null,
}));

vi.mock('~/core/hooks/use-is-personal-space', () => ({
  useIsPersonalSpace: () => (mocks.spaceType ? mocks.spaceType === 'PERSONAL' : undefined),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.viewerSpace }),
}));
vi.mock('~/core/follows/follow-button', () => ({
  FollowButton: (props: { target: { kind: string; id: string; name?: string | null } }) => (
    <button type="button" data-testid="follow" data-kind={props.target.kind} data-id={props.target.id}>
      Follow {props.target.name}
    </button>
  ),
}));
vi.mock('./explore-join-space-button', () => ({
  ExploreJoinSpaceButton: () => <button type="button">Join</button>,
}));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const item = (overrides: Partial<ExploreFeedItem> = {}): ExploreFeedItem => ({
  entityId: 'claim-1',
  spaceId: SPACE,
  spaceName: 'Ada Okafor',
  spaceImage: null,
  types: [{ id: 'claim-type', name: 'Claim' }],
  createdAtSec: 0,
  title: 'A claim',
  description: null,
  imageUrl: null,
  recordingUrls: [],
  debateVideoUrls: [],
  debateClaim: null,
  commentCount: 0,
  isMemberOrEditor: false,
  hasPendingMembershipRequest: false,
  ...overrides,
});

beforeEach(() => {
  mocks.spaceType = undefined;
  mocks.viewerSpace = null;
});

afterEach(cleanup);

describe('ExploreMetaRow join or follow (GEO-3236)', () => {
  it('offers to follow the owner of a personal space instead of joining it', () => {
    mocks.spaceType = 'PERSONAL';
    render(<ExploreMetaRow item={item()} />);

    expect(screen.getByTestId('follow')).toHaveAttribute('data-kind', 'person');
    expect(screen.getByTestId('follow')).toHaveAttribute('data-id', SPACE);
    expect(screen.queryByText('Join')).toBeNull();
  });

  it('keeps Join for a shared space', () => {
    mocks.spaceType = 'PUBLIC';
    render(<ExploreMetaRow item={item()} />);

    expect(screen.getByText('Join')).toBeInTheDocument();
    expect(screen.queryByTestId('follow')).toBeNull();
  });

  it('draws Join while the space is still unknown', () => {
    render(<ExploreMetaRow item={item()} />);

    expect(screen.getByText('Join')).toBeInTheDocument();
  });

  it("offers Follow on someone else's personal space even when you're a member of it", () => {
    mocks.spaceType = 'PERSONAL';
    render(<ExploreMetaRow item={item({ isMemberOrEditor: true })} />);

    expect(screen.getByTestId('follow')).toHaveAttribute('data-id', SPACE);
  });

  it('keeps your own Follow mounted on your own space, outside the dotted row', () => {
    // It draws nothing there, but a self-follow queued while signed out needs it mounted to drop.
    mocks.spaceType = 'PERSONAL';
    mocks.viewerSpace = SPACE;
    const { container } = render(<ExploreMetaRow item={item({ isMemberOrEditor: true })} />);

    expect(screen.getByTestId('follow')).toBeInTheDocument();
    // An offer that shows nothing takes no segment, so the type leads the dotted run with no dot.
    expect(container.textContent).not.toContain('·');
  });

  it('offers nothing on a shared space you are already in', () => {
    mocks.spaceType = 'PUBLIC';
    render(<ExploreMetaRow item={item({ isMemberOrEditor: true })} />);

    expect(screen.queryByText('Join')).toBeNull();
    expect(screen.queryByTestId('follow')).toBeNull();
  });
});
