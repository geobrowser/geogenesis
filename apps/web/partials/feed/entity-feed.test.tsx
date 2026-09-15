import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_EXPLORE_TYPE_IDS,
  EXPLORE_ENTITY_TYPES,
  EXPLORE_ENTITY_TYPE_IDS,
} from '~/core/explore/explore-constants';
import { EXPLORE_TYPE_FILTER_STORAGE_KEY, exploreTypeFilterLabel } from '~/core/explore/explore-type-filter';

import { EntityFeed } from './entity-feed';

const mocks = vi.hoisted(() => ({
  queryOptions: null as Record<string, unknown> | null,
  /** Every key the feed has subscribed under, so a test can see what it asked for *first*. */
  queryKeys: [] as unknown[][],
  fetch: vi.fn(),
  /** Pages the mocked infinite query hands back, so a test can put a card on the page. */
  pages: null as { items: Record<string, unknown>[] }[] | null,
  /** Props the last rendered card received. */
  cardProps: null as Record<string, unknown> | null,
  /** The viewer's spaces as the live query answers them; null until it does. */
  liveMemberSpaceIds: null as Set<string> | null,
  /** Whether a request the viewer made is still missing from that answer. */
  isSettlingMemberships: false,
  /** What the feed asked the allowlist hook for. */
  allowlistEnabled: undefined as boolean | undefined,
}));

function createLocalStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: (options: Record<string, unknown>) => {
    mocks.queryOptions = options;
    mocks.queryKeys.push(options.queryKey as unknown[]);
    return {
      data: mocks.pages ? { pages: mocks.pages } : undefined,
      isLoading: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      error: null,
    };
  },
}));

vi.mock('~/core/debates/use-claim-space-allowlist', () => ({
  useClaimSpaceAllowlist: (enabled?: boolean) => {
    mocks.allowlistEnabled = enabled;
    return {
      allowlist: null,
      memberSpaceIds: mocks.liveMemberSpaceIds,
      isLoading: false,
      isSettlingMemberships: mocks.isSettlingMemberships,
    };
  },
}));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: null }),
}));

vi.mock('~/design-system/menu', () => ({
  Menu: ({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) => (
    <>
      {trigger}
      {children}
    </>
  ),
  MenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('~/partials/explore/explore-feed-card', () => ({
  ExploreFeedCard: (props: Record<string, unknown>) => {
    mocks.cardProps = props;
    return null;
  },
}));

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorage());
  mocks.queryOptions = null;
  mocks.pages = null;
  mocks.cardProps = null;
  mocks.queryKeys = [];
  mocks.liveMemberSpaceIds = null;
  mocks.isSettlingMemberships = false;
  mocks.allowlistEnabled = undefined;
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [], nextCursor: null }) });
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The request the feed would make right now, as a URL. */
async function requestedUrl() {
  const queryFn = mocks.queryOptions?.queryFn as (args: { pageParam?: string }) => Promise<unknown>;
  await queryFn({ pageParam: undefined });
  return mocks.fetch.mock.calls.at(-1)?.[0] as string;
}

/**
 * The mocked Menu renders its trigger and its items together, so a word can appear twice. The
 * trigger's accessible name is "Time range: <value>", which both tells it apart from the item
 * holding the same word and keeps the value it is showing.
 */
const timeTrigger = () => screen.queryByRole('button', { name: /^Time range:/ });
const pickOption = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));

// GEO-2610. The range answers "top of when?", so it belongs to Top alone. Best is ranked
// server-side and New is ordered by recency already; a window over either is a filter the viewer
// never asked for and — with the dropdown hidden — cannot see they have.
describe('EntityFeed time range visibility', () => {
  function renderExploreFeed() {
    return render(
      <EntityFeed
        apiEndpoint="/api/explore/feed"
        initialSpaceOptions={[]}
        initialTime="month"
        initialSort="best"
        showSortFilter
      />
    );
  }

  it('hides the time dropdown for Best', () => {
    renderExploreFeed();

    expect(timeTrigger()).toBeNull();
  });

  it('hides it for New too', () => {
    renderExploreFeed();

    pickOption('New');

    expect(timeTrigger()).toBeNull();
  });

  it('shows it once Top is picked', () => {
    renderExploreFeed();

    pickOption('Top');

    expect(timeTrigger()).not.toBeNull();
  });

  it('hides it again when leaving Top', async () => {
    renderExploreFeed();

    pickOption('Top');
    expect(timeTrigger()).not.toBeNull();
    pickOption('New');

    await waitFor(() => expect(timeTrigger()).toBeNull());
  });

  // `aria-label` replaces the visible text as the accessible name, so naming the control without
  // its value would leave a screen reader unable to tell which sort or range is selected —
  // `MenuItem` marks the active option with a background colour and nothing else.
  it('announces the value each dropdown is showing, not just what it selects', () => {
    renderExploreFeed();

    expect(screen.queryByRole('button', { name: 'Sort: Best' })).not.toBeNull();

    pickOption('Top');

    expect(screen.queryByRole('button', { name: 'Sort: Top' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Time range: Last month' })).not.toBeNull();
  });

  // The point of the ticket: a hidden range must not quietly filter the feed.
  it('leaves the range out of the request when it is hidden', async () => {
    renderExploreFeed();
    await waitFor(() => expect(mocks.queryOptions?.enabled).toBe(true));

    expect(await requestedUrl()).not.toContain('time=');
  });

  it('sends the range when Top is showing it', async () => {
    renderExploreFeed();
    pickOption('Top');

    expect(await requestedUrl()).toContain('time=month');
  });

  // Resetting to a default would lose a choice the viewer made; the state is simply not consulted
  // while there is nowhere to show it.
  it('restores the range the viewer last picked when they return to Top', async () => {
    renderExploreFeed();

    pickOption('Top');
    pickOption('Last year');
    pickOption('New');
    await waitFor(() => expect(timeTrigger()).toBeNull());

    pickOption('Top');

    expect(timeTrigger()).not.toBeNull();
    expect(await requestedUrl()).toContain('time=year');
  });

  // Two Best feeds differing only in a hidden range are the same request; caching them apart would
  // refetch on a change the viewer never made.
  it('keys the query on what it actually sends', async () => {
    renderExploreFeed();
    await waitFor(() => expect(mocks.queryOptions?.enabled).toBe(true));
    const bestKey = mocks.queryOptions?.queryKey as unknown[];

    pickOption('Top');
    pickOption('Last year');
    pickOption('Best');
    await waitFor(() => expect(timeTrigger()).toBeNull());

    expect(mocks.queryOptions?.queryKey).toEqual(bestKey);
  });

  // The activity feed opts out of the range entirely, and its request is unchanged by this: it sent
  // `time=all` before and sends nothing now, which the route reads the same way.
  it('sends no range for a feed that opts out of the filter', async () => {
    render(
      <EntityFeed apiEndpoint="/api/activity/feed" lockedSpaceId="space-1" initialTime="all" showTimeFilter={false} />
    );
    await waitFor(() => expect(mocks.queryOptions?.enabled).toBe(true));

    expect(timeTrigger()).toBeNull();
    expect(await requestedUrl()).not.toContain('time=');
  });
});

describe('EntityFeed Explore type filter', () => {
  it('arrives on the default types, sends them, and persists nothing until the reader chooses', async () => {
    // GEO-2790. The default is a real selection now rather than "everything", so it has to be sent:
    // an omitted param means all types to the route, not the default. See the test below.
    render(<EntityFeed apiEndpoint="/api/explore/feed" initialSpaceOptions={[]} showSortFilter showTypeFilter />);

    await screen.findByText(exploreTypeFilterLabel(DEFAULT_EXPLORE_TYPE_IDS.length));
    await waitFor(() => expect(mocks.queryOptions?.enabled).toBe(true));
    // Still nothing written. A default is a guess about what someone wants before they say, and
    // persisting it would make every arriving reader indistinguishable from one who chose it.
    expect(window.localStorage.getItem(EXPLORE_TYPE_FILTER_STORAGE_KEY)).toBeNull();

    const queryFn = mocks.queryOptions?.queryFn as (args: { pageParam?: string }) => Promise<unknown>;
    await queryFn({ pageParam: undefined });
    const requestUrl = mocks.fetch.mock.calls[0]?.[0] as string;
    // Read the param rather than substring the URL: `URLSearchParams` percent-encodes the commas.
    const sentTypeIds = new URLSearchParams(requestUrl.split('?')[1]).get('typeIds');
    expect(sentTypeIds).toBe(DEFAULT_EXPLORE_TYPE_IDS.join(','));
  });

  it('omits the type parameter only when every type is selected', async () => {
    // The trap this change had to avoid, guarded end to end. The client drops `typeIds` precisely
    // when all of them are ticked, and the route reads a missing param as "all types" — so if that
    // fallback were ever changed to the default three, ticking every box would return three types.
    window.localStorage.setItem(EXPLORE_TYPE_FILTER_STORAGE_KEY, JSON.stringify(EXPLORE_ENTITY_TYPE_IDS));

    render(<EntityFeed apiEndpoint="/api/explore/feed" initialSpaceOptions={[]} showSortFilter showTypeFilter />);

    await screen.findByText(exploreTypeFilterLabel(EXPLORE_ENTITY_TYPE_IDS.length));
    await waitFor(() => expect(mocks.queryOptions?.enabled).toBe(true));

    const queryFn = mocks.queryOptions?.queryFn as (args: { pageParam?: string }) => Promise<unknown>;
    await queryFn({ pageParam: undefined });
    const requestUrl = mocks.fetch.mock.calls[0]?.[0] as string;
    expect(requestUrl).not.toContain('typeIds=');
  });

  it('restores cached types, sends them to the feed, and persists checklist changes', async () => {
    const selectedTypeId = EXPLORE_ENTITY_TYPE_IDS[0];
    window.localStorage.setItem(EXPLORE_TYPE_FILTER_STORAGE_KEY, JSON.stringify([selectedTypeId]));

    render(<EntityFeed apiEndpoint="/api/explore/feed" initialSpaceOptions={[]} showSortFilter showTypeFilter />);

    await screen.findByText('1 type');
    await waitFor(() => expect(mocks.queryOptions?.enabled).toBe(true));

    const queryFn = mocks.queryOptions?.queryFn as (args: { pageParam?: string }) => Promise<unknown>;
    await queryFn({ pageParam: undefined });
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`typeIds=${selectedTypeId}`),
      expect.objectContaining({ credentials: 'include' })
    );

    fireEvent.click(screen.getByRole('button', { name: /News story/ }));
    await screen.findByText('0 types');
    await waitFor(() => expect(window.localStorage.getItem(EXPLORE_TYPE_FILTER_STORAGE_KEY)).toBe('[]'));
  });

  it('applies rapid toggles to the latest selection', async () => {
    // Labels and ids both come from `EXPLORE_ENTITY_TYPES`, so the test clicks the same entries it
    // asserts on. It used to take the first three ids positionally while clicking Episode and Post
    // by name, which only agreed because those happened to be positions two and three — reordering
    // the menu for GEO-2790 broke it. Which types these are does not matter to what is being
    // tested; that they are the same ones does.
    const [first, second, third] = EXPLORE_ENTITY_TYPES;
    window.localStorage.setItem(EXPLORE_TYPE_FILTER_STORAGE_KEY, JSON.stringify([first.id]));

    render(<EntityFeed apiEndpoint="/api/explore/feed" initialSpaceOptions={[]} showSortFilter showTypeFilter />);
    await screen.findByText('1 type');

    act(() => {
      screen.getByRole('button', { name: new RegExp(second.label) }).click();
      screen.getByRole('button', { name: new RegExp(third.label) }).click();
    });

    await screen.findByText('3 types');
    await waitFor(() =>
      expect(window.localStorage.getItem(EXPLORE_TYPE_FILTER_STORAGE_KEY)).toBe(
        JSON.stringify([first.id, second.id, third.id])
      )
    );
  });

  it('selects and unselects all types from the menu action', async () => {
    render(<EntityFeed apiEndpoint="/api/explore/feed" initialSpaceOptions={[]} showSortFilter showTypeFilter />);
    // The default is a subset now, so the action on arrival is Select all rather than Unselect all.
    await screen.findByText(exploreTypeFilterLabel(DEFAULT_EXPLORE_TYPE_IDS.length));

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    await screen.findByText(exploreTypeFilterLabel(EXPLORE_ENTITY_TYPE_IDS.length));
    await waitFor(() =>
      expect(window.localStorage.getItem(EXPLORE_TYPE_FILTER_STORAGE_KEY)).toBe(JSON.stringify(EXPLORE_ENTITY_TYPE_IDS))
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unselect all' }));
    await screen.findByText('0 types');
    await waitFor(() => expect(window.localStorage.getItem(EXPLORE_TYPE_FILTER_STORAGE_KEY)).toBe('[]'));
  });

  it('preserves the historical query key for feeds without the Explore type filter', () => {
    render(<EntityFeed apiEndpoint="/api/activity/feed" lockedSpaceId="space-id" />);

    // The time slot is empty rather than 'week': this feed sorts by New, which carries no range,
    // so there is nothing to send and nothing to key on. Same positions otherwise.
    expect(mocks.queryOptions?.queryKey).toEqual(['/api/activity/feed', 'new', undefined, 'space-id', null]);
  });
  // GEO-2757. Explore opts its cards into opening the side panel; the space activity tab, which
  // renders this same feed, does not. The flag is a single forward, so nothing but a test says it
  // is still being made.
  describe('titleOpensSidePanel', () => {
    const item = {
      entityId: 'entity-1',
      spaceId: 'space-1',
      spaceName: 'Space',
      spaceImage: null,
      types: [],
      createdAtSec: 0,
      title: 'An entity',
      description: null,
      imageUrl: null,
      commentCount: 0,
      recordingUrls: [],
      debateVideoUrls: [],
      isMemberOrEditor: true,
      hasPendingMembershipRequest: false,
    };

    it('hands the flag to every card when the feed is opted in', () => {
      mocks.pages = [{ items: [item] }];
      render(<EntityFeed apiEndpoint="/api/explore/feed" titleOpensSidePanel />);

      expect(mocks.cardProps?.titleOpensSidePanel).toBe(true);
    });

    it('leaves cards navigating when it is not', () => {
      mocks.pages = [{ items: [item] }];
      render(<EntityFeed apiEndpoint="/api/activity/feed" lockedSpaceId="space-1" />);

      expect(mocks.cardProps?.titleOpensSidePanel).toBe(false);
    });
  });
});

/**
 * GEO-2789, the explore half. The feed used to open unfiltered over every space the reader may
 * see — featured ones included, which say nothing about who is asking. It opens on theirs now,
 * with the rest still on the menu to widen back to, and the same multi-select the debates side
 * panel uses so the two filters read and behave alike.
 */
describe('the space filter', () => {
  const OPTIONS = [
    { value: 'space-featured', label: 'Crypto' },
    { value: 'space-mine', label: 'Relationships' },
    { value: 'space-pending', label: 'US Politics' },
  ];

  function renderFeed(memberSpaceIds?: string[]) {
    return render(
      <EntityFeed
        apiEndpoint="/api/explore/feed"
        initialSpaceOptions={OPTIONS}
        memberSpaceIds={memberSpaceIds}
        showSortFilter
      />
    );
  }

  /** The trigger, which the mocked Menu renders alongside the options. */
  const spaceTrigger = () => screen.getAllByRole('button', { name: /Any space|Relationships|spaces$/ })[0];

  const sentSpaceIds = async () => new URLSearchParams((await requestedUrl()).split('?')[1]).get('spaceIds');

  it('opens on the spaces the reader belongs to', async () => {
    renderFeed(['space-mine']);

    expect(await sentSpaceIds()).toBe('space-mine');
  });

  // A membership the reader has asked for is one of theirs: they chose it at sign-up, and nothing
  // should lurch when the approval lands.
  // The default is applied in the feed's own initial state rather than by the hook's effect, because
  // both sides are server props here and the answer is already in hand. Starting empty would
  // subscribe to the unfiltered query, fire that request, and only then narrow — two requests on
  // every load, with the wide feed on screen in between.
  it('never subscribes to the unfiltered feed on the way to the default', () => {
    renderFeed(['space-mine']);

    expect(mocks.queryKeys.length).toBeGreaterThan(0);
    for (const key of mocks.queryKeys) expect(key).toContain('space-mine');
  });

  it('counts a pending membership as one of theirs', async () => {
    renderFeed(['space-mine', 'space-pending']);

    expect((await sentSpaceIds())?.split(',').sort()).toEqual(['space-mine', 'space-pending']);
  });

  // The fallback, and the case every signed-out reader is in.
  it('shows everything when the reader belongs to none of the spaces on offer', async () => {
    renderFeed([]);

    expect(await sentSpaceIds()).toBeNull();
    expect(spaceTrigger().textContent).toContain('Any space');
  });

  it('holds the default while their memberships are still unknown', async () => {
    // Undefined is not empty: spending the default on a viewer whose spaces had not arrived would
    // land them on the fallback for the whole visit.
    renderFeed(undefined);

    expect(await sentSpaceIds()).toBeNull();
  });

  // GEO-2815. The prop is what their spaces were when the page was rendered, and a reader who has
  // just signed up is rendered before they have any: the personal space takes minutes to land and
  // the requests behind their sign-up picks are fired after it. The filter opened on nothing — the
  // unfiltered feed over every featured space — and a server prop cannot move, so it stayed there
  // until a hard refresh.
  it('applies the default when their memberships arrive after the page was rendered', async () => {
    const { rerender } = renderFeed([]);
    expect(await sentSpaceIds()).toBeNull();

    mocks.liveMemberSpaceIds = new Set(['space-pending']);
    rerender(
      <EntityFeed apiEndpoint="/api/explore/feed" initialSpaceOptions={OPTIONS} memberSpaceIds={[]} showSortFilter />
    );

    await waitFor(async () => expect(await sentSpaceIds()).toBe('space-pending'));
  });

  // The seed is spent on a match, so a reader who acted before their memberships landed keeps what
  // they asked for. Without this the late answer would be a policy rather than a default.
  it('leaves a reader who has already touched the filter alone', async () => {
    const { rerender } = renderFeed([]);
    pickOption('Crypto');
    expect(await sentSpaceIds()).toBe('space-featured');

    mocks.liveMemberSpaceIds = new Set(['space-pending']);
    rerender(
      <EntityFeed apiEndpoint="/api/explore/feed" initialSpaceOptions={OPTIONS} memberSpaceIds={[]} showSortFilter />
    );

    expect(await sentSpaceIds()).toBe('space-featured');
  });

  // Inverting this gate reinstates the bug in full — Explore never asks for the memberships, so the
  // live answer never arrives — while spending a request on every space-pinned feed. Nothing else
  // in the suite notices, because the argument is otherwise invisible from outside.
  it('asks for the viewer’s spaces on the cross-space feed, and not on a pinned one', () => {
    renderFeed(['space-mine']);
    expect(mocks.allowlistEnabled).toBe(true);
    cleanup();

    render(<EntityFeed apiEndpoint="/api/activity/feed" lockedSpaceId="space-id" />);
    expect(mocks.allowlistEnabled).toBe(false);
  });

  // The live value is not reliably the fresher of the two: it can be a cache entry up to a minute
  // old that the sidebar filled on another route, while the prop was computed during this render.
  // Preferring it would drop a space the reader had just joined back out of their own default.
  it('keeps a space the server prop knows about but the cached answer does not', async () => {
    mocks.liveMemberSpaceIds = new Set(['space-mine']);
    renderFeed(['space-mine', 'space-pending']);

    expect((await sentSpaceIds())?.split(',').sort()).toEqual(['space-mine', 'space-pending']);
  });

  // The seed is spent on the first non-empty match, and sign-up sends one proposal per picked
  // space — they land seconds apart. Spending it on the first to arrive pins the reader to that one
  // and silently drops the rest of what they chose.
  it('holds the default while more of their memberships are still landing', async () => {
    mocks.isSettlingMemberships = true;
    mocks.liveMemberSpaceIds = new Set(['space-mine']);
    const { rerender } = renderFeed([]);

    expect(await sentSpaceIds()).toBeNull();

    mocks.isSettlingMemberships = false;
    mocks.liveMemberSpaceIds = new Set(['space-mine', 'space-pending']);
    rerender(
      <EntityFeed apiEndpoint="/api/explore/feed" initialSpaceOptions={OPTIONS} memberSpaceIds={[]} showSortFilter />
    );

    expect((await sentSpaceIds())?.split(',').sort()).toEqual(['space-mine', 'space-pending']);
  });

  it('lets the reader widen to a featured space they have not joined', async () => {
    renderFeed(['space-mine']);

    pickOption('Crypto');

    expect((await sentSpaceIds())?.split(',').sort()).toEqual(['space-featured', 'space-mine']);
  });

  it('clears back to every space, and the default does not put theirs back', async () => {
    renderFeed(['space-mine']);
    expect(await sentSpaceIds()).toBe('space-mine');

    pickOption('Any space');

    expect(await sentSpaceIds()).toBeNull();
  });
});
