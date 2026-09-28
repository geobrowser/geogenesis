# GEO-2963: mobile Explore feed scroll-depth investigation

## Outcome

The pre-fix implementation supports the ticket's decoder- and memory-exhaustion hypothesis. Explore
kept every fetched card mounted, and a debate permanently kept two sourced video elements plus its
playback/query subtree after it first came within 800 px of the viewport. Scrolling a debate away
only paused the elements; it never detached their sources or called `load()` to release browser media
resources. The number of retained video elements therefore grew with scroll depth.

This PR changes that lifetime: only debate cards currently inside an 800 px viewport margin mount
their heavy media/query subtree, and eviction explicitly resets both video elements. Because each
card observes proximity independently, this is a spatial bound rather than an exact global player or
video count. The count varies with viewport size and local debate-card density, but no longer grows
merely because the reader passed more debates earlier in the session.

This is a code-path investigation. It does not claim a device memory measurement: final thresholds
still need to be verified on a physical iPhone and Android device. The pre-fix code established the
unbounded lifetime that made the reported blank panels and tab reloads increasingly likely.

## Field reproduction

On 2026-09-18, before the media-lifetime implementation was added, commit `e282e7bfd` of this PR was
tested in mobile Chrome on a physical mobile device. At that point the branch changed documentation
only, so its Vercel preview exercised the same feed/player path as the `master` baseline:

1. scroll down a few pages of Explore;
2. stop on a debate and wait for its video to load;
3. after approximately 30 seconds, the site crashes.

That baseline result confirmed the scroll-depth crash on a real mobile browser and tied the terminal
failure to loading a debate after resources had already accumulated. Without a browser memory trace
or crash log it did not, by itself, prove whether the immediate kill came from memory, a decoder
ceiling, or both; the unbounded retention path below remained the leading cause.

After the P0 fix was deployed, the same mobile Chrome scroll-and-wait flow was repeated on the fixed
preview and did not crash. That is a successful field smoke test, not an instrumented long-scroll or
a measurement of the device's memory/decoder ceiling; the broader validation below remains useful.

## Fix implemented in this PR

The P0 media-lifetime fix now ships alongside this investigation:

- The 800 px media look-ahead is no longer sticky. A debate player and its debate-only action/query
  subtree mount as the card approaches and unmount after it leaves the same bounded window.
- Evicting a player explicitly pauses both video elements, removes both `src` attributes, and calls
  `load()` so mobile browsers can return decoder and buffer resources immediately.
- Reverse scrolling remounts the cached debate as a preloading, inactive player before the card is
  visible.
- Component regression tests cover eviction/remount, both-element source release, and React Strict
  Mode's cleanup/setup rehearsal.

This bounds live media resources with viewport proximity even though lightweight feed rows still
accumulate. Physical-device long-scroll validation remains required; whole-row virtualization and a
central exact preload budget remain follow-up hardening rather than prerequisites for this fix.

## Pre-fix confirmed path

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

### 3. Proximity was sticky, including preload

The card set `nearViewport` to `true` the first time it intersected an 800 px root margin and never
set it back to `false`. That value gated the debate and media queries, selected the full player over
the skeleton, and was passed to the player as `preload`.

`DebateFeedPlayer` called `useDebatePlayback(debate, active || preload)`. Once a card had approached
the viewport, `preload` stayed true for the lifetime of the feed, so its playback URLs and transcript
query remained enabled even when the card was many screens behind the reader.

Relevant code:

- `apps/web/partials/explore/debate-explore-feed-card.tsx`: the former sticky `nearViewport`
  observer and `preload={nearViewport}` path
- `apps/web/core/debates/browse/debate-feed-player.tsx`: `active || preload`
- `apps/web/core/debates/use-debate-playback.ts`: recording URL state and transcript query

Expected consequence: the intended one-card look-ahead became a permanent retain flag. Every
debate the reader passed kept its media and data subtree live.

### 4. Scroll-out paused playback but did not release media

When a card deactivated, the player called `suspend()`. `suspend()` called `pause()` and updated
React state. Neither it nor an unmount cleanup removed the `src` attribute and called `load()`. The
URL was also deliberately retained in hook state for smooth re-entry.

Retaining the URL fixed re-fetch flicker in GEO-2895, but the pre-fix combination of URL retention
and a permanently mounted player was unsafe in an unvirtualized infinite list: paused elements could
continue holding decoder/demuxer state and buffered media.

Relevant code:

- `apps/web/core/debates/browse/debate-feed-player.tsx`: inactive-player effect
- `apps/web/core/debates/use-debate-playback.ts`: `suspend()` and retained `urls`

Expected consequence: media memory did not need to fall when a debate left the viewport, so pressure
was determined by total scroll depth rather than the small number of visible cards.

### 5. Retained work was wider than video playback

Once a debate became ready, its mounted subtree also subscribed to votes, transcript claims,
playback transcript/media, participant space/profile data, and playback analytics. Pausing the
videos did not unsubscribe any of those consumers.

Expected consequence: video resources are the likely crash trigger, while React/query state and
request fan-out add avoidable memory, CPU, and network pressure during a long scroll.

### 6. The feed API is paginated; the primary defect is client retention

The Explore API serves 22 display items per page and carries a cursor. Its server-side scan can be
wider than 22 to satisfy filtering and diversity rules, but those scan rows are not all sent to the
browser. This can affect response latency, but it does not explain a browser tab whose reliability
degrades monotonically with the number of debate players already passed.

## Recommended fixes

### P0 (implemented): window the heavy debate subtree

Keep the lightweight card shell if preserving mixed-height scroll geometry is useful, but mount
`DebateCardVideos` and the debate-only action/query subtree only inside a bounded viewport window.
Use a non-sticky proximity observer for media, separate from any sticky data-fetch flag.

Implemented proximity policy:

- each debate card independently mounts its heavy subtree while intersecting an 800 px viewport
  margin;
- leaving that margin unmounts the subtree and releases both video elements;
- reverse scrolling remounts the cached debate before the card becomes visible;
- concurrent players and attached videos depend on viewport height and debate-card density; this P0
  has no exact global count cap and does not promise exactly one active debate.

When a retained shell re-enters the window, remount its player. A short skeleton or poster is safer
than retaining an unbounded set of live media elements to avoid a brief reload.

Expected impact: video element, decoder, buffer, playback-hook, and media-query counts track the
current proximity window instead of total scroll depth. This is the highest-confidence crash fix and
does not require variable-height whole-list virtualization.

### P0 (implemented): explicitly release media on eviction and unmount

The shared cleanup helper calls `pause()`, removes the `src` attribute, and calls `load()` for each
video element. Leaving the media window unmounts the player, which runs that cleanup and tears down
the playback/query subtree. Signed HTTP URLs do not need `URL.revokeObjectURL`, but any later blob
URL would.

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

Add a browser test that advances through enough mocked pages to render at least 50 debates. Under the
current proximity policy, assert that cards outside the 800 px window have no attached videos and
that the attached count returns to the local-window high-water mark rather than growing with scroll
depth. After P1 centralizes ownership, tighten that assertion to the chosen exact budget. Separately
test that eviction calls pause, source detach, and load for both elements, and that reverse scrolling
can remount and play a released debate.

Expected impact: turns the mobile-only crash mechanism into a desktop-CI invariant even though CI
cannot reproduce iOS's decoder ceiling.

## Device validation and acceptance criteria

The fixed preview has passed the same physical-device mobile Chrome smoke flow that crashed the
baseline preview. For comprehensive validation, use Safari Web Inspector on a physical iPhone and
Chrome remote debugging on a physical Android device. Desktop emulation is useful for counters and
network behavior but is not a substitute for the mobile decoder/memory ceiling.

Use a feed/filter combination with enough debates, then scroll past at least 50 debate cards at both
normal and rapid speed. Record the baseline and peak for the following:

1. Cards outside the 800 px proximity window have no mounted player or sourced `<video>` elements.
2. Mounted/sourced video counts track the cards inside that window instead of accumulating with
   total scroll depth; record the observed high-water mark rather than assuming an exact count.
3. An evicted video is paused, has no `src`, and has received `load()`.
4. Media/request concurrency settles after scrolling stops and old offscreen requests do not remain
   active merely because their feed rows are retained.
5. Memory plateaus around the proximity-window high-water mark and drops after eviction/GC instead of
   climbing with every page.
6. Both panels continue loading and playing after 50 debates; no blank white panel, random reload,
   or tab crash occurs.
7. Reverse scrolling remounts a released player and preserves acceptable UX, including mute state.

After the P1 centralized owner is implemented, add the stronger exact-count criteria: exactly one
active debate and no more than the chosen number of preload candidates/video elements.

## Scope boundaries

- The no-audio symptom can follow a failed/partial player under resource pressure, but autoplay
  policy and user-audio behavior remain GEO-2953 unless they reproduce after media retention is
  bounded.
- GEO-2950 overlaps in playback symptoms. If its failures disappear under the bounded-player test,
  both tickets likely share this root cause; otherwise its restart/control failures need a separate
  trace.
- This PR intentionally limits implementation to the P0 media-lifetime change. Central exact-budget
  ownership and whole-feed virtualization remain separate follow-ups so the crash fix stays small
  enough to validate independently.
