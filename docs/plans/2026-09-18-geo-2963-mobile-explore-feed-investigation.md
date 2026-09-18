# GEO-2963: mobile Explore feed scroll-depth investigation

## Outcome

The implementation supports the ticket's decoder- and memory-exhaustion hypothesis. Explore keeps
every fetched card mounted, and a debate permanently keeps two sourced video elements plus its
playback/query subtree after it first comes within 800 px of the viewport. Scrolling a debate away
only pauses the elements; it never detaches their sources or calls `load()` to release browser media
resources. The number of retained video elements therefore grows with scroll depth.

This is a code-path investigation. It does not claim a device memory measurement: final thresholds
still need to be verified on a physical iPhone and Android device. The code already establishes the
unbounded lifetime that makes the reported blank panels and tab reloads increasingly likely.

## Confirmed path

### 1. The feed appends forever and does not virtualize

`EntityFeed` uses an infinite query, flattens every page in `data.pages`, and renders the complete
array with `items.map(...)`. No old page or card is removed as the reader advances.

The pagination observer also uses an `8000px` root margin. It intentionally asks for the next page
far ahead of the viewport, so a fast scroll can grow the retained list well before those cards are
visible. A page contains 22 items (`EXPLORE_PAGE_SIZE`).

Relevant code:

- `apps/web/partials/feed/entity-feed.tsx`: `useInfiniteQuery`, the pagination observer, page
  flattening, and `items.map(...)`
- `apps/web/core/explore/explore-constants.ts`: `EXPLORE_PAGE_SIZE = 22`

Expected consequence: DOM nodes, React component state, and query observers all grow monotonically
with scroll depth, even before considering media.

### 2. Each loaded debate owns two video elements

`DebateExploreFeedCard` renders `DebateFeedPlayer`, whose `DebaterVideo` component is instantiated
twice. Both elements receive signed recording URLs as `src` and use `preload="metadata"`.

Relevant code:

- `apps/web/partials/explore/debate-explore-feed-card.tsx`: `DebateCardVideos`
- `apps/web/core/debates/browse/debate-feed-player.tsx`: the two `DebaterVideo` calls and the
  `<video>` element

Expected consequence: the browser's media pressure rises two decoders/resources at a time. A
one-sided blank panel is consistent with one element obtaining resources while its sibling cannot.

### 3. Proximity is sticky, including preload

The card sets `nearViewport` to `true` the first time it intersects an 800 px root margin and never
sets it back to `false`. That value gates the debate and media queries, selects the full player over
the skeleton, and is passed to the player as `preload`.

`DebateFeedPlayer` calls `useDebatePlayback(debate, active || preload)`. Once a card has approached
the viewport, `preload` stays true for the lifetime of the feed, so its playback URLs and transcript
query remain enabled even when the card is many screens behind the reader.

Relevant code:

- `apps/web/partials/explore/debate-explore-feed-card.tsx`: the `nearViewport` observer and
  `preload={nearViewport}`
- `apps/web/core/debates/browse/debate-feed-player.tsx`: `active || preload`
- `apps/web/core/debates/use-debate-playback.ts`: recording URL state and transcript query

Expected consequence: the intended one-card look-ahead becomes a permanent retain flag. Every
debate the reader passes keeps its media and data subtree live.

### 4. Scroll-out pauses playback but does not release media

When a card deactivates, the player calls `suspend()`. `suspend()` calls `pause()` and updates React
state. Neither it nor an unmount cleanup removes the `src` attribute and calls `load()`. The URL is
also deliberately retained in hook state for smooth re-entry.

That retention fixed re-fetch flicker in GEO-2895, but it is unsafe when combined with an
unvirtualized infinite list: paused elements can continue holding decoder/demuxer state and buffered
media.

Relevant code:

- `apps/web/core/debates/browse/debate-feed-player.tsx`: inactive-player effect
- `apps/web/core/debates/use-debate-playback.ts`: `suspend()` and retained `urls`

Expected consequence: media memory need not fall when a debate leaves the viewport, so pressure is
determined by total scroll depth rather than the small number of visible cards.

### 5. Retained work is wider than video playback

Once a debate becomes ready, its mounted subtree also subscribes to votes, transcript claims,
playback transcript/media, participant space/profile data, and playback analytics. Pausing the videos
does not unsubscribe any of those consumers.

Expected consequence: video resources are the likely crash trigger, while React/query state and
request fan-out add avoidable memory, CPU, and network pressure during a long scroll.

### 6. The feed API is paginated; the primary defect is client retention

The Explore API serves 22 display items per page and carries a cursor. Its server-side scan can be
wider than 22 to satisfy filtering and diversity rules, but those scan rows are not all sent to the
browser. This can affect response latency, but it does not explain a browser tab whose reliability
degrades monotonically with the number of debate players already passed.

## Recommended fixes

### P0: window the heavy debate subtree

Keep the lightweight card shell if preserving mixed-height scroll geometry is useful, but mount
`DebateCardVideos` and the debate-only action/query subtree only inside a bounded viewport window.
Use a non-sticky proximity observer for media, separate from any sticky data-fetch flag.

Initial budget:

- one active debate;
- at most one approaching debate ahead;
- optionally one recently active debate behind for smooth reverse scrolling;
- no more than six `<video>` elements attached at once (three debates times two), with a target of
  four on mobile.

When a retained shell re-enters the window, remount its player. A short skeleton or poster is safer
than retaining an unbounded set of live media elements to avoid a brief reload.

Expected impact: video element, decoder, buffer, playback-hook, and media-query counts become
constant with scroll depth. This is the highest-confidence crash fix and can be implemented without
first solving variable-height whole-list virtualization.

### P0: explicitly release media on eviction and unmount

Add one cleanup helper for each player element:

1. cancel/supersede in-flight resume work;
2. call `pause()`;
3. remove the `src` attribute (and any nested `<source>` attributes if introduced later);
4. call `load()`;
5. clear the element ref and player URL state as appropriate.

Run the helper when a debate leaves the media window and when the player unmounts. Signed HTTP URLs
do not need `URL.revokeObjectURL`, but any later blob URL would.

Keep this distinct from the ordinary `suspend()` path: a nearby inactive card may stay warm, while
an evicted card must release resources.

Expected impact: makes resource release explicit on Safari instead of depending on delayed garbage
collection, and prevents old paused players from retaining buffers/decoder state.

### P1: centralize active and preload ownership

Individual cards currently decide `active` independently. Move the media budget to the feed so it
can name exactly one active debate and a bounded set of preload candidates. Pass an explicit mode
such as `unloaded | preload | active` to each debate card/player.

Use `preload="none"` for an attached but unloaded element (or do not attach `src` at all),
`preload="metadata"` only for the bounded preload candidate, and autoplay only the active card.

Expected impact: prevents several cards near an intersection threshold from fetching or starting
at once, caps concurrent recording URL and range requests, and makes the resource invariant
testable in one place.

### P1: reduce the pagination look-ahead

Replace the fixed `8000px` sentinel margin with a smaller viewport-relative horizon, initially one
to two viewports, and measure whether 22-item pages already provide enough runway. Guard against
back-to-back next-page fetches while the sentinel remains in the preload band.

Expected impact: reduces bursty card/query construction during fast scroll. This is supportive,
not sufficient by itself: a smaller margin still leaks resources if old debate players remain
mounted.

### P1: virtualize or evict whole feed rows after media is safe

Add mixed-height row virtualization, or retain a bounded page range with scroll spacers, after the
media subtree is independently bounded. Preserve focus, side-panel state, measured row heights, and
reverse-scroll position.

Expected impact: bounds the remaining DOM and React/query-observer growth across all entity types.
This is a broader optimization and carries more interaction/scroll-position risk than media-only
windowing, so it should not block the P0 fix.

### P2: add resource instrumentation and a long-scroll regression

In development/test builds, expose counters for:

- mounted debate players and `<video>` elements;
- elements with an attached `src`;
- active and preload debate ids;
- in-flight recording URL/media requests.

Add a browser test that advances through enough mocked pages to render at least 50 debates and
asserts that attached video elements never exceed the chosen budget. Separately test that eviction
calls pause, source detach, and load for both elements, and that reverse scrolling can remount and
play a released debate.

Expected impact: turns the mobile-only crash mechanism into a desktop-CI invariant even though CI
cannot reproduce iOS's decoder ceiling.

## Device validation and acceptance criteria

Validate the fix with Safari Web Inspector on a physical iPhone and Chrome remote debugging on a
physical Android device. Desktop emulation is useful for counters and network behavior but is not a
substitute for the mobile decoder/memory ceiling.

Use a feed/filter combination with enough debates, then scroll past at least 50 debate cards at both
normal and rapid speed. Record the baseline and peak for the following:

1. The number of mounted and sourced `<video>` elements stays at or below the declared budget,
   independent of scroll depth.
2. Only one debate is active; preload never extends beyond the bounded candidates.
3. An evicted video is paused, has no `src`, and has received `load()`.
4. Media/request concurrency is bounded and settles after scrolling stops.
5. Memory plateaus around the media-window high-water mark and drops after eviction/GC instead of
   climbing with every page.
6. Both panels continue loading and playing after 50 debates; no blank white panel, random reload,
   or tab crash occurs.
7. Reverse scrolling remounts a released player and preserves acceptable UX, including mute state.

## Scope boundaries

- The no-audio symptom can follow a failed/partial player under resource pressure, but autoplay
  policy and user-audio behavior remain GEO-2953 unless they reproduce after media retention is
  bounded.
- GEO-2950 overlaps in playback symptoms. If its failures disappear under the bounded-player test,
  both tickets likely share this root cause; otherwise its restart/control failures need a separate
  trace.
- This ticket's requested deliverable is the investigation and fix list. Implementation should be
  split into a P0 media-lifetime change and a later whole-feed virtualization change so the crash
  fix is small enough to validate independently.
