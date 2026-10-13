import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedItem } from '~/core/explore/explore-card-item';

import { ExploreMetaRow } from './explore-meta-row';

const SPACE = '73a82967cb12f604f9589ac4bc8024cb';

const mocks = vi.hoisted(() => ({ spaceType: undefined as 'PERSONAL' | 'PUBLIC' | undefined }));

vi.mock('~/core/hooks/use-is-personal-space', () => ({
  useIsPersonalSpace: () => (mocks.spaceType ? mocks.spaceType === 'PERSONAL' : undefined),
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
});
