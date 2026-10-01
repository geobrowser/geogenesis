import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebateEntityView } from './debate-entity-view';

const mocks = vi.hoisted(() => ({
  pathname: '/space/space-1/debate-1',
  anchors: [] as Array<string | undefined>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => false }));

vi.mock('./debate-feed', () => ({
  DebatesBrowseFeed: ({ initialDebateId }: { initialDebateId?: string }) => {
    mocks.anchors.push(initialDebateId);
    return null;
  },
}));

afterEach(() => {
  cleanup();
  mocks.anchors.length = 0;
});

describe('DebateEntityView anchor', () => {
  it('anchors on the debate the page was opened at', () => {
    mocks.pathname = '/space/space-1/debate-1';
    render(<DebateEntityView spaceId="space-1" debateId="debate-1" editView={null} />);
    expect(mocks.anchors.at(-1)).toBe('debate-1');
  });

  // Back restores the route the page was opened at, with the URL the feed had rewritten to the
  // debate being watched. The URL is the one that is right.
  it('anchors on the debate the URL names when it has moved on from the route param', () => {
    mocks.pathname = '/space/space-1/debate-3';
    render(<DebateEntityView spaceId="space-1" debateId="debate-1" editView={null} />);
    expect(mocks.anchors.at(-1)).toBe('debate-3');
  });

  it('does not follow the URL after mount, as the feed rewrites it on every swipe', () => {
    mocks.pathname = '/space/space-1/debate-1';
    const view = render(<DebateEntityView spaceId="space-1" debateId="debate-1" editView={null} />);
    mocks.pathname = '/space/space-1/debate-2';
    view.rerender(<DebateEntityView spaceId="space-1" debateId="debate-1" editView={null} />);
    expect(mocks.anchors.at(-1)).toBe('debate-1');
  });
});
