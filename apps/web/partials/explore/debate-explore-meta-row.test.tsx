import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedItem } from '~/core/explore/explore-card-item';

import { DebateExploreMetaRow } from './debate-explore-meta-row';

const SPACE = '73a82967cb12f604f9589ac4bc8024cb';

const mocks = vi.hoisted(() => ({
  isPersonal: undefined as boolean | undefined,
  trending: false,
  trendingAskedFor: [] as (string | null | undefined)[],
}));

vi.mock('~/core/hooks/use-is-personal-space', () => ({ useIsPersonalSpace: () => mocks.isPersonal }));
// The Trending tag's agenda read (GEO-3497) is a query of its own; these rows render without a client.
vi.mock('~/core/debates/todays-claims/trending', () => ({
  useIsTrending: (entityId: string | null | undefined) => {
    mocks.trendingAskedFor.push(entityId);
    return mocks.trending;
  },
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));
vi.mock('~/core/follows/follow-button', () => ({
  FollowButton: (props: { target: { kind: string; id: string } }) => (
    <button type="button" data-testid="follow" data-id={props.target.id}>
      Follow
    </button>
  ),
}));
vi.mock('./explore-join-space-button', () => ({
  ExploreJoinSpaceButton: (props: { variant?: string }) => (
    <button type="button" data-variant={props.variant}>
      Join
    </button>
  ),
}));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const item: ExploreFeedItem = {
  entityId: 'debate-1',
  spaceId: SPACE,
  spaceName: 'Ada Okafor',
  spaceImage: null,
  types: [{ id: 'debate-type', name: 'Debate' }],
  createdAtSec: 0,
  title: 'A debate',
  description: null,
  imageUrl: null,
  recordingUrls: [],
  debateVideoUrls: [],
  debateClaim: null,
  commentCount: 0,
  isMemberOrEditor: false,
  hasPendingMembershipRequest: false,
};

beforeEach(() => {
  mocks.isPersonal = undefined;
  mocks.trending = false;
  mocks.trendingAskedFor = [];
});

afterEach(cleanup);

describe('DebateExploreMetaRow join or follow (GEO-3236)', () => {
  it('offers Follow, not Join, on a debate posted in a personal space', () => {
    mocks.isPersonal = true;
    render(<DebateExploreMetaRow item={item} />);

    expect(screen.getByTestId('follow')).toHaveAttribute('data-id', SPACE);
    expect(screen.queryByText('Join')).toBeNull();
  });

  it('keeps its own pill-style Join for a shared space', () => {
    mocks.isPersonal = false;
    render(<DebateExploreMetaRow item={item} />);

    expect(screen.getByText('Join')).toHaveAttribute('data-variant', 'pill');
    expect(screen.queryByTestId('follow')).toBeNull();
  });
});

describe('DebateExploreMetaRow Trending tag (GEO-3497)', () => {
  it("flags a debate whose claim is on a current agenda, asking by the debate's own id", () => {
    mocks.trending = true;
    render(<DebateExploreMetaRow item={item} />);

    expect(screen.getByText('Trending')).toBeInTheDocument();
    // gaia answers a debate's `lastListedOn` with its claim's, so the debate id is the question.
    expect(mocks.trendingAskedFor).toContain('debate-1');
  });

  it('shows no tag for a debate off the agenda', () => {
    render(<DebateExploreMetaRow item={item} />);

    expect(screen.queryByText('Trending')).toBeNull();
  });
});
