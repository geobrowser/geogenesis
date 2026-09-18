'use client';

import * as React from 'react';

import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';

import { Skeleton } from '~/design-system/skeleton';

import { SectionTitle } from '~/partials/entity-page/section-title';
import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';

import { useTopicSpaceScope } from '../use-topic-space-scope';
import {
  useTopicDebateRowsInfinite,
  useTopicExploreRows,
  useTopicExploreRowsInfinite,
} from './use-topic-explore-rows';

/** Rows on Overview, where the section is a taste of the tab rather than the tab. */
const PREVIEW_PAGE_SIZE = 3;

/** Rows per request once the section has a tab to itself. */
const FULL_PAGE_SIZE = 20;

export type TopicSectionMode = 'preview' | 'full';

/**
 * Where the rows come from.
 *
 * `linked` is the ordinary case — things that carry a `Topics` relation to this topic, narrowed by
 * `typeIds`. `debates` is the exception the graph forces: a Debate carries `Claims` and never
 * `Topics`, so it is reached through the claims it argues and needs its own query.
 */
export type TopicSectionSource = 'linked' | 'debates';

/**
 * A topic's linked entities as explore-feed rows — the body of the Claims and Coverage tabs, and
 * their previews on Overview.
 *
 * One component for both because they are one thing with a different type list (GEO-2910). The page
 * used to draw three row designs for its three streams: `MatchmakingClaimCard` for claims, a
 * borrowed `DebateRow` for debates, and this — the actual explore card — for coverage. Coverage had
 * already learned the lesson and left it written down: *"The rows are `ExploreFeedCard` itself, not
 * a lookalike … the version this section drew by hand had already drifted: no image, no timestamp,
 * no actions, a type chip where the feed sets a dotted meta line."*
 *
 * `ExploreFeedCard` dispatches on the entity's own types, so a Claim row gets
 * `ClaimExploreFeedCard` — labelled position pills, the shared verdict column, no thumbnail well it
 * has no image to fill — without this component knowing anything about claims.
 *
 * ## Two modes, and why their order differs
 *
 * `preview` is Overview: one page, no pager, and whatever the caller puts in `viewAllSlot` to reach
 * the tab. It keeps the explore feed's **Best** order, which is what a single page wants.
 *
 * `full` is the tab: it scrolls, and it is ordered by **Recent**. Best cannot span it. Asking the
 * ranked connection for a topic-filtered set returns rows in id order and takes ~17s (GEO-2720), so
 * the ranking only ever holds *inside* a page. Paged, that is invisible — you see one page at a
 * time. Scrolled, the pages become one list, page two's best row lands under page one's worst, and
 * the ranking visibly restarts every twenty rows. Recent is a total order the server can actually
 * produce, so it survives being scrolled. When GEO-2720 lands, Best becomes available here too.
 */
export function TopicExploreSection({
  topicId,
  spaceId,
  typeIds,
  label,
  mode,
  source = 'linked',
  viewAllSlot,
}: {
  topicId: string;
  spaceId: string;
  /** Ignored when `source` is `debates`, which has no type list to narrow. */
  typeIds: string[];
  /** Section heading, and its accessible name, so the two cannot disagree. */
  label: string;
  mode: TopicSectionMode;
  source?: TopicSectionSource;
  /** Overview only: the control that opens this section's own tab. */
  viewAllSlot?: React.ReactNode;
}) {
  const scopedSpaceIds = useTopicSpaceScope(spaceId);
  const isFull = mode === 'full';
  const isDebates = source === 'debates';

  // Every hook runs every render — a hook cannot be called conditionally — and the ones this mode
  // is not using are disabled, so they cost no request.
  const preview = useTopicExploreRows({
    topicId,
    typeIds,
    first: PREVIEW_PAGE_SIZE,
    spaceIds: scopedSpaceIds,
    enabled: !isFull && !isDebates,
  });
  const full = useTopicExploreRowsInfinite({
    topicId,
    typeIds,
    first: FULL_PAGE_SIZE,
    spaceIds: scopedSpaceIds,
    enabled: isFull && !isDebates,
  });
  // Debates page the same way in both modes — the preview simply asks for fewer. There is no Best
  // ranking to preserve here: the query orders by recency server-side, so nothing changes when the
  // list is scrolled rather than previewed.
  const debates = useTopicDebateRowsInfinite({
    topicId,
    first: isFull ? FULL_PAGE_SIZE : PREVIEW_PAGE_SIZE,
    spaceIds: scopedSpaceIds,
    enabled: isDebates,
  });

  const active = isDebates ? debates : isFull ? full : null;
  const rows = active ? active.rows : preview.page.rows;
  const isLoading = active ? active.isLoading : preview.isLoading;
  const hasNextPage = isFull && active !== null && active.hasNextPage;

  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage,
    isFetchingNextPage: active?.isFetchingNextPage ?? false,
    fetchNextPage: active?.fetchNextPage ?? (() => undefined),
    // The side panel scrolls inside itself, so `rootMargin` only buys lead time when it is measured
    // against the panel rather than the viewport.
    rootSelector: '[data-entity-side-panel]',
  });

  // The spaces the rows landed in — a different question from the scope above, which is the spaces
  // they were allowed to come from. Routinely spaces the viewer has never opened and the browse
  // sidebar cannot name, so they are looked up in one batch rather than per card.
  const rowSpaceIds = React.useMemo(() => [...new Set(rows.map(row => row.spaceId))], [rows]);
  const { labelsById } = useSpaceLabels(rowSpaceIds);
  const items = React.useMemo(
    () => rows.map(row => toFeedItem(row, spaceLabel(labelsById, row.spaceId))),
    [labelsById, rows]
  );

  if (isLoading && items.length === 0) {
    return (
      <section aria-label={label}>
        <SectionTitle>{label}</SectionTitle>
        <Skeleton className="h-[140px] w-full rounded-lg" />
      </section>
    );
  }

  // A section with nothing in it says nothing, so it removes itself. In a tab this is the case
  // where the rows and the tab's own count disagree — a scope that resolved after the count did,
  // say — rather than the ordinary empty state, which drops the tab before the reader can open it.
  if (items.length === 0) return null;

  return (
    <section aria-label={label}>
      {viewAllSlot ? (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <SectionTitle className="mb-0">{label}</SectionTitle>
          {viewAllSlot}
        </div>
      ) : (
        <SectionTitle>{label}</SectionTitle>
      )}
      {/* Cards as direct siblings, exactly as the feed renders them: their bottom rule is a
          `last:border-b-0` on the card itself, so a wrapper around each one would leave a rule
          hanging under the final row. */}
      <div>
        {items.map(item => (
          // No Join button: the feed offers one for spaces the viewer isn't in, and it knows that
          // from membership data this query has no way to ask for — so rather than render the
          // control in a state derived from a default, it isn't offered here.
          //
          // `titleOpensSidePanel` so a row opens in the entity side panel the rest of the app
          // already uses rather than navigating away from a list the reader has scrolled. Debates
          // are excluded from that by `ExploreCardEntityLink` itself (GEO-2794), so a debate row
          // still navigates — the exception lives in the link component, which is what makes it
          // hold wherever a debate card is drawn, here included.
          <ExploreFeedCard key={`${item.entityId}-${item.spaceId}`} item={item} hideJoinButton titleOpensSidePanel />
        ))}
      </div>
      {hasNextPage ? <div ref={sentinelRef} aria-hidden className="h-px w-full" /> : null}
    </section>
  );
}

function toFeedItem(
  row: Omit<ExploreFeedItem, 'spaceName' | 'spaceImage' | 'hasPendingMembershipRequest'>,
  label: SpaceLabel | undefined
): ExploreFeedItem {
  return {
    ...row,
    // The same last resort the feed uses when a space has no name yet: an id fragment, which at
    // least differs between two spaces where a shared placeholder would not.
    spaceName: label?.name ?? row.spaceId.slice(0, 8),
    spaceImage: label?.image ?? null,
    hasPendingMembershipRequest: false,
  };
}
