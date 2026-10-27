import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExplorePage } from './explore-page';
import { feedTopicsAtom } from '~/atoms/onboarding-feed-topics';

const mocks = vi.hoisted(() => ({
  flags: {} as Record<string, boolean>,
  feedProps: [] as Record<string, unknown>[],
  smartAccount: null as null | { account: { address: string } },
  followedTopicIds: new Set(['bbbb', 'aaaa']),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) => mocks.flags[id] ?? false,
}));

vi.mock('~/core/hooks/use-awaited-smart-account', () => ({
  useAwaitedSmartAccount: (signedIn: boolean) => ({
    smartAccountAddress: mocks.smartAccount?.account.address ?? null,
    awaitingAccount: signedIn && !mocks.smartAccount,
  }),
}));
// Privy still restoring: the state a reader with a wallet cookie is in on first paint.
vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ ready: false, authenticated: false }),
  useIdentityToken: () => ({ identityToken: null }),
}));
vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: null }) }));
vi.mock('~/core/topics/use-followed-topics', () => ({
  useFollowedTopics: () => ({ topicIds: mocks.followedTopicIds, isLoading: false }),
}));

vi.mock('./explore-welcome-banner', () => ({ ExploreWelcomeBanner: () => null }));
// Stubbed alongside its siblings above: the capture reaches Privy and wagmi for the account
// shortcut it offers (GEO-2948), and this suite is about which column the layout reserves.
vi.mock('./explore-live-lobbies-banner', () => ({ ExploreLiveLobbiesBanner: () => null }));
vi.mock('./email-capture-popup', () => ({ ExploreEmailCapturePopup: () => null }));
// GEO-3421: the past-call list is geo-chat's; here only what the feed is handed matters.
const pastCallInterleave = () => new Map();
vi.mock('~/core/space-calls/recording/explore-past-calls', () => ({
  usePastCallInterleave: (enabled: boolean) => (enabled ? pastCallInterleave : undefined),
}));
vi.mock('~/partials/feed/entity-feed', () => ({
  EntityFeed: (props: Record<string, unknown>) => {
    mocks.feedProps.push(props);
    return <div data-testid="feed" />;
  },
}));

function renderExplore() {
  return render(
    // The panel has its own suites; this one is about whether it is rendered at all. It stands in as
    // an `<aside>` because that element is the thing the layout keys on — see the reflow case below.
    <ExplorePage sidePanel={<aside data-testid="explore-side-panel" />} />
  );
}

beforeEach(() => {
  mocks.flags = {};
  mocks.feedProps = [];
  mocks.smartAccount = null;
  mocks.followedTopicIds = new Set(['bbbb', 'aaaa']);
});
afterEach(cleanup);

/**
 * GEO-2914. The panel is hidden on Explore, not removed — so what is pinned here is both halves:
 * that it is gone by default, and that the flag still brings back the real thing.
 */
describe('ExplorePage side panel', () => {
  it('does not render the side panel', () => {
    renderExplore();

    expect(screen.queryByTestId('explore-side-panel')).toBeNull();
    // The feed is still the page, so this is not passing on a page that failed to render.
    expect(screen.getByTestId('feed')).toBeInTheDocument();
  });

  // Hidden rather than deleted: the surface is still built and still fed by the page's own queries,
  // so the flag is the whole of what it takes to have it back.
  it('renders it again when the flag is on', () => {
    mocks.flags = { exploreSidePanel: true };
    renderExplore();

    expect(screen.getByTestId('explore-side-panel')).toBeInTheDocument();
  });

  // The reflow, asserted through its actual mechanism rather than a screenshot: the container is
  // `auto-sidebar`, which widens itself only through `has-[aside]:`. No `<aside>` in the tree is
  // what makes the content take the reclaimed width instead of holding an empty column open.
  it('leaves no aside for the layout to reserve a column for', () => {
    const { container } = renderExplore();

    expect(container.querySelector('aside')).toBeNull();
  });

  it('puts one there when the panel is back, so the container widens for it', () => {
    mocks.flags = { exploreSidePanel: true };
    const { container } = renderExplore();

    expect(container.querySelector('aside')).not.toBeNull();
  });
});

/** GEO-3083. For you is behind a flag, and with it off Explore must not change at all. */
describe('ExplorePage For you sort', () => {
  it('opens on Best with the default sorts when the flag is off', () => {
    renderExplore();

    expect(mocks.feedProps.at(-1)?.initialSort).toBe('best');
    expect(mocks.feedProps.at(-1)?.sortOptions).toBeUndefined();
  });

  it('opens on For you and offers it first when the flag is on', () => {
    mocks.flags = { forYouFeed: true };
    renderExplore();

    expect(mocks.feedProps.at(-1)).toMatchObject({
      initialSort: 'for-you',
      sortOptions: ['for-you', 'best', 'top', 'new'],
      followedTopicIds: ['aaaa', 'bbbb'],
    });
  });

  it('offers topic Follow on the cards of both feeds', () => {
    renderExplore();
    expect(mocks.feedProps.at(-1)?.topicFollow).toBe(true);

    cleanup();
    mocks.flags = { forYouFeed: true };
    renderExplore();
    expect(mocks.feedProps.at(-1)?.topicFollow).toBe(true);
  });

  function renderWithHeldPicks(owner: string) {
    const store = createStore();
    store.set(feedTopicsAtom, {
      address: owner,
      topics: [
        { id: 'cccc', name: 'Bitcoin' },
        { id: 'aaaa', name: 'Already followed' },
      ],
    });
    render(
      <Provider store={store}>
        <ExplorePage sidePanel={null} />
      </Provider>
    );
    return store;
  }

  it('counts onboarding picks still waiting to be followed', () => {
    mocks.flags = { forYouFeed: true };
    mocks.smartAccount = { account: { address: '0xA' } };
    renderWithHeldPicks('0xa');

    expect(mocks.feedProps.at(-1)?.followedTopicIds).toEqual(['aaaa', 'bbbb', 'cccc']);
    expect(mocks.feedProps.at(-1)?.pendingTopicFollows).toBe(true);
  });

  it("ignores another account's held picks", () => {
    mocks.flags = { forYouFeed: true };
    mocks.smartAccount = { account: { address: '0xB' } };
    renderWithHeldPicks('0xA');

    expect(mocks.feedProps.at(-1)?.followedTopicIds).toEqual(['aaaa', 'bbbb']);
    expect(mocks.feedProps.at(-1)?.pendingTopicFollows).toBe(false);
  });

  it('ends the onboarding fallback after submission even if the followed topic ids stay the same', () => {
    mocks.flags = { forYouFeed: true };
    mocks.smartAccount = { account: { address: '0xA' } };
    mocks.followedTopicIds = new Set(['aaaa', 'bbbb', 'cccc']);
    const store = renderWithHeldPicks('0xA');
    expect(mocks.feedProps.at(-1)?.pendingTopicFollows).toBe(true);

    act(() => store.set(feedTopicsAtom, { address: '', topics: [] }));

    expect(mocks.feedProps.at(-1)?.followedTopicIds).toEqual(['aaaa', 'bbbb', 'cccc']);
    expect(mocks.feedProps.at(-1)?.pendingTopicFollows).toBe(false);
  });

  // Privy restores the wallet after mount; until then the follows read as empty.
  it('waits for a signed-in account instead of serving Best first', () => {
    mocks.flags = { forYouFeed: true };
    render(<ExplorePage sidePanel={null} walletAddress="0x00000000000000000000000000000000000000aa" />);

    expect(mocks.feedProps.at(-1)?.followedTopicIds).toBeNull();
  });
});

describe('ExplorePage past calls', () => {
  it('hands the feed nothing to interleave with the flag off', () => {
    renderExplore();
    expect(mocks.feedProps.at(-1)?.interleave).toBeUndefined();
  });

  it('hands it the past calls with the flag on, on either sort', () => {
    mocks.flags = { callRecording: true };
    const { unmount } = renderExplore();
    expect(mocks.feedProps.at(-1)?.interleave).toBe(pastCallInterleave);
    unmount();

    mocks.flags = { callRecording: true, forYouFeed: true };
    renderExplore();
    expect(mocks.feedProps.at(-1)?.interleave).toBe(pastCallInterleave);
  });
});
