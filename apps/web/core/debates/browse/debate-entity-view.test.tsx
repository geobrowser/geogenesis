import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebateEntityView } from './debate-entity-view';

const mocks = vi.hoisted(() => ({
  pathname: '/space/space-1/debate-1',
  editing: false,
  replace: vi.fn(),
  anchors: [] as Array<string | undefined>,
  /** Which server view the feed would show: what it was handed for each of its two outs. */
  feedViews: null as { fallback: unknown; removedView: unknown } | null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => mocks.editing }));

vi.mock('./debate-feed', () => ({
  DebatesBrowseFeed: (props: { initialDebateId?: string; fallback?: unknown; removedView?: unknown }) => {
    mocks.anchors.push(props.initialDebateId);
    mocks.feedViews = { fallback: props.fallback, removedView: props.removedView };
    return null;
  },
}));

afterEach(() => {
  cleanup();
  mocks.anchors.length = 0;
  mocks.editing = false;
  mocks.feedViews = null;
  mocks.replace.mockReset();
  window.history.replaceState(null, '', '/');
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

// The feed rewrites the URL to the debate on screen without a navigation, so the server-rendered
// views — the value sheet behind edit mode, the fallback and the removed page — still describe the
// debate the page was opened at.
describe('DebateEntityView server views after the URL has moved on', () => {
  const editView = <div>Debate 1 value sheet</div>;
  const removedView = <div>Debate 1 removed</div>;

  function renderAt(pathname: string) {
    mocks.pathname = pathname;
    window.history.replaceState(null, '', pathname);
    return render(
      <DebateEntityView spaceId="space-1" debateId="debate-1" editView={editView} removedView={removedView} />
    );
  }

  it("does not open the opened debate's value sheet under another debate's URL", () => {
    mocks.editing = true;
    renderAt('/space/space-1/debate-2');

    expect(screen.queryByText('Debate 1 value sheet')).not.toBeInTheDocument();
    // Re-rendered for the URL instead, without a history entry.
    expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debate-2', { scroll: false });
  });

  it('opens the value sheet as before while the URL still names the opened debate', () => {
    mocks.editing = true;
    renderAt('/space/space-1/debate-1');

    expect(screen.getByText('Debate 1 value sheet')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("does not hand the feed the opened debate's fallback or removed page once the URL has moved", () => {
    renderAt('/space/space-1/debate-2');

    expect(mocks.feedViews?.fallback).not.toBe(editView);
    expect(mocks.feedViews?.removedView).not.toBe(removedView);
    // Nothing is re-rendered unless the feed actually reaches for one of them.
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('hands the feed its server views while the URL still names the opened debate', () => {
    renderAt('/space/space-1/debate-1');

    expect(mocks.feedViews?.fallback).toBe(editView);
    expect(mocks.feedViews?.removedView).toBe(removedView);
  });
});
