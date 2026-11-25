import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { DebateEntityView, debatePageSeedEntries, debatedClaimContent } from './debate-entity-view';

const mocks = vi.hoisted(() => ({
  pathname: '/space/space-1/debate-1',
  editing: false,
  replace: vi.fn(),
  anchors: [] as Array<string | undefined>,
  /** Which server view the feed would show: what it was handed for each of its two outs. */
  feedViews: null as { fallback: unknown; removedView: unknown } | null,
  belowLinkedDebate: undefined as ((debate: Debate) => unknown) | undefined,
}));

vi.mock('~/core/templates/views/live-claim-template-view', () => ({
  LiveClaimSectionsView: (props: { entityId: string; spaceId: string; title: string }) => (
    <div data-testid="claim-sections">{`${props.spaceId}/${props.entityId}: ${props.title}`}</div>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => mocks.editing }));

vi.mock('./debate-feed', () => ({
  DebatesBrowseFeed: (props: {
    initialDebateId?: string;
    fallback?: unknown;
    removedView?: unknown;
    belowLinkedDebate?: (debate: Debate) => unknown;
  }) => {
    mocks.anchors.push(props.initialDebateId);
    mocks.belowLinkedDebate = props.belowLinkedDebate;
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

describe('debatePageSeedEntries (GEO-3604)', () => {
  const debate = { id: '01a0448a61d371018434a20fdadf6f97' } as never;
  const media = { job: null, artifacts: [] } as never;

  it('seeds the row and the readiness under the keys the feed reads', () => {
    expect(debatePageSeedEntries('01a0448a61d371018434a20fdadf6f97', { debate, media, signedIn: false })).toEqual([
      { queryKey: ['debates', 'detail', '01a0448a61d371018434a20fdadf6f97'], data: debate },
      { queryKey: ['debates', 'media', '01a0448a61d371018434a20fdadf6f97'], data: media },
    ]);
  });

  it('seeds a signed-in reader’s row already stale, since it lacks their own fields', () => {
    const [row, readiness] = debatePageSeedEntries('01a0448a61d371018434a20fdadf6f97', {
      debate,
      media,
      signedIn: true,
    });
    expect(row).toMatchObject({ updatedAt: 0 });
    expect(readiness).not.toHaveProperty('updatedAt');
  });

  it('seeds nothing it was not given, nor a row for another debate', () => {
    expect(debatePageSeedEntries('01a0448a61d371018434a20fdadf6f97', undefined)).toEqual([]);
    expect(debatePageSeedEntries('01a0448a61d371018434a20fdadf6f00', { debate, media: null, signedIn: false })).toEqual(
      []
    );
  });
});

describe('DebateEntityView claim below the debate (GEO-3869)', () => {
  const debateAbout = (claim: Partial<Debate['claim']>) =>
    ({
      id: 'debate-1',
      claim: {
        id: 'c',
        space_id: 'space-2',
        claim_entity_id: 'claim-1',
        claim: 'Debates are useful',
        description: null,
        ...claim,
      },
    }) as Debate;

  it('hands the feed the debated claim’s content to scroll into, in the claim’s own space', () => {
    mocks.pathname = '/space/space-1/debate-1';
    render(<DebateEntityView spaceId="space-1" debateId="debate-1" editView={null} />);
    expect(mocks.belowLinkedDebate).toBe(debatedClaimContent);

    render(<>{debatedClaimContent(debateAbout({}))}</>);
    expect(screen.getByTestId('claim-sections')).toHaveTextContent('space-2/claim-1: Debates are useful');
  });

  it('adds nothing for a debate with no claim', () => {
    expect(debatedClaimContent(debateAbout({ claim_entity_id: '' }))).toBeNull();
    expect(debatedClaimContent({ id: 'debate-1' } as unknown as Debate)).toBeNull();
  });
});
