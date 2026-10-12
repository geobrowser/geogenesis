import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PersonFollowCounts } from './person-follow-counts';

const mocks = vi.hoisted(() => ({
  followers: null as number | null,
  following: new Set<string>(),
  isLoadingFollowing: false,
}));

vi.mock('./use-follower-count', () => ({
  useFollowerCount: () => mocks.followers,
  useFollowers: () => null,
}));
vi.mock('~/core/topics/use-followed-topics', () => ({
  useFollowedInterests: () => ({ ids: mocks.following, isLoading: mocks.isLoadingFollowing }),
}));

beforeEach(() => {
  mocks.followers = null;
  mocks.following = new Set();
  mocks.isLoadingFollowing = false;
});

afterEach(cleanup);

describe('PersonFollowCounts (GEO-3236)', () => {
  it('reads followers, then everything they follow, people and topics alike', () => {
    mocks.followers = 42;
    mocks.following = new Set(['topic-a', 'person-space-b', 'topic-c']);
    const { container } = render(<PersonFollowCounts spaceId="space-1" />);

    expect(container.textContent).toBe('42 followers·3 following');
  });

  it('says "follower" for one', () => {
    mocks.followers = 1;
    const { container } = render(<PersonFollowCounts spaceId="space-1" />);

    expect(container.textContent).toBe('1 follower');
  });

  it('holds its line while a count loads, so the header under it does not jump', () => {
    mocks.followers = 4;
    mocks.isLoadingFollowing = true;
    const { container } = render(<PersonFollowCounts spaceId="space-1" />);

    expect(container.querySelector('p')).toHaveClass('h-5');
    expect(container.textContent).toBe('');
  });

  it('leaves out a half that is zero, and the line when both are', () => {
    mocks.followers = 0;
    mocks.following = new Set(['topic-a']);
    const { container, rerender } = render(<PersonFollowCounts spaceId="space-1" />);
    expect(container.textContent).toBe('1 following');

    mocks.following = new Set();
    rerender(<PersonFollowCounts spaceId="space-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
