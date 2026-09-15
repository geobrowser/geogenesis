'use client';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { DebateClaimsPanel } from '~/core/debates/browse/debate-claims-panel';
import { DebateFeedPlayer } from '~/core/debates/browse/debate-feed-player';
import { DebateInteractionBar } from '~/core/debates/browse/debate-interaction-bar';
import { JoinDebateButton } from '~/core/debates/browse/join-debate-button';
import { DebateShareDialog } from '~/core/debates/browse/share-dialog';
import { useDebateShareAction } from '~/core/debates/browse/use-debate-share-action';
import { useDebate, useDebateMedia } from '~/core/debates/hooks';
import { hasProcessedVideo, isWatchableDebate } from '~/core/debates/playback-utils';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { useDebateVotes } from '~/core/debates/use-debate-votes';
import { formatExploreRelativeTime } from '~/core/explore/explore-relative-time';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { useEntityCommentsPanel } from '~/core/hooks/use-entity-comments-panel';
import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ExploreCardEntityLink } from './explore-card-entity-link';
import { ExploreJoinSpaceButton } from './explore-join-space-button';
import { SpaceThumb } from './space-thumb';

/** Visible fraction at which a card takes over playback, and the one it must fall back to
 * before it gives it up. Strictly between them the card keeps whatever state it had. */
const ACTIVATE_RATIO = 0.6;
const DEACTIVATE_RATIO = 0.4;

type DebateExploreFeedCardProps = {
  item: ExploreFeedItem;
  /** Hide the space thumbnail + space-name link in the meta row (same semantics as ExploreFeedCard). */
  hideSpaceLink?: boolean;
  /** Hide the Join-space chip in the meta row (same semantics as ExploreFeedCard). */
  hideJoinButton?: boolean;
  /** Whether the claim title opens the side panel rather than navigating (same semantics as ExploreFeedCard). */
  titleOpensSidePanel?: boolean;
  /**
   * Rendered instead of the debate card when the debate can't be shown as a video — feature flag
   * off, the geo-chat record is missing or unwatchable, or its final video isn't processed yet.
   * Mirrors the fallback pattern of DebateEntityView so a Debate entity is never hidden outright.
   */
  fallback: React.ReactNode;
};

/**
 * The explore-feed rendition of a published Debate: the same two synchronized debater videos as
 * the full-screen `/debates` feed (autoplaying muted while in view, with winner voting) over the
 * same interaction bar, framed in the explore card chrome — meta row, title, and the media capped
 * to the card's width.
 *
 * Both renditions render `DebateFeedPlayer` and `DebateInteractionBar`, in the same arrangement —
 * the claim over the videos, the bar as a rail down their right — so everything inside the debate
 * itself is one component in both places rather than two that look alike (GEO-2912).
 */
export function DebateExploreFeedCard({
  item,
  hideSpaceLink = false,
  hideJoinButton = false,
  titleOpensSidePanel = false,
  fallback,
}: DebateExploreFeedCardProps) {
  // A Debate entity's id is its geo-chat debate id (see useDebateVotes), modulo hyphenation.
  const debateId = ID.hexToUuid(item.entityId);

  const [container, setContainer] = React.useState<HTMLElement | null>(null);

  // The feed mounts items far below the fold (its pagination sentinel uses a huge rootMargin), so
  // gate the geo-chat lookups on proximity to the viewport instead of on mount — otherwise every
  // debate in every loaded page fires its requests at once. Sticky: once fetched, stay fetched.
  const [nearViewport, setNearViewport] = React.useState(false);
  React.useEffect(() => {
    if (!container || nearViewport) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) setNearViewport(true);
      },
      { rootMargin: '800px' }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [container, nearViewport]);

  // Autoplay while mostly in view, pause when scrolled past — same activation ratio as the
  // full-screen feed. Playback is muted by default so multiple visible cards can't clash.
  //
  // Hysteresis, not a single ratio: this used to activate on `intersectionRatio >= 0.6` and
  // deactivate on anything less, so a card resting near that boundary toggled on every small
  // scroll delta. Unlike the full-screen feed — a snap container where exactly one full-height
  // card can clear 0.6, and activation only ever moves — these cards are short, several are on
  // screen at once, and nothing else holds a card active. Each toggle starts or interrupts a
  // playback attempt, which is what made scrolling feel glitchy (GEO-2895).
  //
  // Now: reach 0.6 to activate, fall back to 0.4 to give it up, and hold whatever the card
  // already was strictly between them. The lower edge is inclusive so that the observer's
  // report at the 0.4 threshold deactivates rather than landing ambiguously inside the band —
  // a ratio reported exactly at a threshold is the normal case, not an edge case.
  const [active, setActive] = React.useState(false);
  React.useEffect(() => {
    if (!container) return;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          setActive(current => {
            if (!entry.isIntersecting) return false;
            if (entry.intersectionRatio >= ACTIVATE_RATIO) return true;
            if (entry.intersectionRatio <= DEACTIVATE_RATIO) return false;
            return current;
          });
        }
      },
      { threshold: [DEACTIVATE_RATIO, ACTIVATE_RATIO] }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  const debateQuery = useDebate(debateId, nearViewport);
  const debate = debateQuery.data;
  const watchable = debate != null && isWatchableDebate(debate);

  // Same two-stage gate as the full-screen feed (GEO-2412): both recordings existing doesn't
  // prove the media job produced a playable final video.
  const mediaQuery = useDebateMedia(debateId, nearViewport && watchable);
  const processed = hasProcessedVideo(mediaQuery.data);

  const notWatchable =
    debateQuery.isError ||
    (debate != null && !watchable) ||
    mediaQuery.isError ||
    (mediaQuery.data != null && !processed);

  const readyDebate = debate != null && watchable && processed ? debate : null;

  // The interaction state lives on the card rather than inside the bar: the bar is shared with the
  // full-screen feed and stays presentational, so what a control opens — the claims overlay, the
  // share dialog, the app's comments panel — is the card's to own and to render once. Same
  // arrangement, same reason, as `DebateFeedItem` on the full-screen feed.
  const [claimsOpen, setClaimsOpen] = React.useState(false);
  const share = useDebateShareAction();
  const { commentsTarget, openComments } = useEntityCommentsPanel();
  // Null until the debate resolves, which the hook reads as "not enabled". Shares a cache entry
  // with the Claims panel, so opening the panel doesn't refetch what this count already loaded.
  const { claims } = useDebateTranscriptClaims(readyDebate?.id ?? null, readyDebate?.claim.space_id ?? null);

  // Runs after every hook so the early return never skips one.
  if (notWatchable) {
    return <>{fallback}</>;
  }

  const timeAgo = formatExploreRelativeTime(item.createdAtSec);

  /**
   * Comments and counts differ from the full-screen feed only in where they come from and where
   * they lead, never in how they look:
   *  - Comments open the app's global panel, as they do from every other explore card, instead of
   *    the feed's own side rail.
   *  - The comment count is the one the explore feed already resolved for the card, so a page of
   *    debates doesn't fetch a thread apiece to render a number.
   *  - Claims and Share stand down until the debate resolves — votes and comments need no debate,
   *    those two do — so the footer is present from the first paint and doesn't shift the card
   *    under the reader when the geo-chat lookups land.
   */
  const interactionProps = {
    entityId: item.entityId,
    spaceId: item.spaceId,
    commentCount: item.commentCount,
    commentsPanelOpen: commentsTarget?.entityId === item.entityId,
    onComment: () => openComments(item.entityId, item.spaceId),
    claimsCount: claims.totalCount,
    onClaims: readyDebate ? () => setClaimsOpen(true) : undefined,
    onShare: readyDebate ? share.onOpen : undefined,
    shareOpen: share.open,
  };

  return (
    <article ref={setContainer} className="flex flex-col gap-2 border-b border-divider py-4 last:border-b-0">
      {/* Meta, title, media and the interaction bar share one column capped at the width the
          designs (and the full-screen feed) use — feed columns, especially data blocks, can be
          much wider and full-bleed videos dwarf the card. Capping the column rather than the media
          alone is what lines "Join a debate" up with the videos' right edge instead of the card's,
          and what keeps the bar beneath the videos the same width as them. */}
      <div className="flex w-full max-w-[480px] min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {!hideSpaceLink ? (
              <Link
                href={NavUtils.toSpace(item.spaceId)}
                className="flex min-w-0 items-center gap-1.5 text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-text hover:underline"
              >
                <SpaceThumb image={item.spaceImage} name={item.spaceName} />
                <span className="min-w-0 truncate">{item.spaceName}</span>
              </Link>
            ) : null}
            {!hideJoinButton && !item.isMemberOrEditor ? (
              // The design puts the join CTA as a compact chip beside the space name, unlike the
              // generic card's right-aligned button — the right side holds the debate CTA.
              <ExploreJoinSpaceButton
                spaceId={item.spaceId}
                hasRequestedSpaceMembership={item.hasPendingMembershipRequest}
                variant="pill"
                label="Join"
              />
            ) : null}
            <span className="rounded-[4px] bg-grey-01 px-1.5 py-0.5 text-[12px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04">
              Debate
            </span>
            <span className="text-[12px] leading-[13px] font-normal tracking-[-0.35px] text-grey-04">{timeAgo}</span>
          </div>
          {/* The same control the full-screen header carries, at the card's own type scale. It
              replaced a "View all" link into this space's debates: the card is already a debate
              you can watch, so the CTA worth the corner is the one that puts you in one rather
              than one that lists more. */}
          <JoinDebateButton className="!text-[14px]" />
        </div>

        <DebateCardTitle item={item} debate={readyDebate} opensSidePanel={titleOpensSidePanel} />

        {readyDebate ? (
          // `nearViewport` is the same 800px-margin gate the geo-chat lookups already use, so
          // the recordings resolve while the card is still approaching rather than on arrival.
          <DebateCardVideos debate={readyDebate} active={active} preload={nearViewport} />
        ) : (
          <DebateVideoSkeleton />
        )}

        {/* Beneath the videos, the same width as them. Full screen carries this bar in a rail down
            the media's right at desktop widths and moves it here at narrow ones; a card is short
            and wide where full screen is tall, so it takes the horizontal arrangement at every
            width. Same component, same controls, same counts — only the axis differs, and that is
            a difference full screen already makes with itself. Wrapper carries the margin so it
            doesn't collide with the bar's own `flex`. */}
        <div className="mt-1">
          <DebateInteractionBar orientation="horizontal" {...interactionProps} />
        </div>
      </div>

      {readyDebate ? (
        <>
          <DebateShareDialog
            open={share.open}
            onOpenChange={share.onOpenChange}
            debate={readyDebate}
            spaceId={item.spaceId}
            openerRef={share.openerRef}
          />
          {/* A right-hand overlay rather than the feed's side rail, since the explore feed has no
              rail to put it in. The panel itself is the same component. */}
          {claimsOpen ? (
            <div className="fixed inset-y-0 right-0 z-100 flex bg-white shadow-card">
              <DebateClaimsPanel debate={readyDebate} onClose={() => setClaimsOpen(false)} />
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

/**
 * The card's title: the claim being debated, linked to the claim entity (GEO-2879).
 *
 * The Debate entity's own name is `"<A> vs. <B> on <claim>"` — the claim with a preamble — so a
 * card titled with it said the same thing as full screen, at twice the length and in a different
 * voice. Until the geo-chat lookup lands there is no claim to show, and the entity name stands in
 * rather than the title arriving a beat after the card.
 *
 * Reuses `ExploreCardEntityLink` rather than hand-rolling a second anchor: it carries the
 * modifier-click rules that keep cmd-click opening a new tab (GEO-2701) and the
 * `data-entity-side-panel-opener` marking that stops a panel switch from reading as an outside
 * click. Its props are a structural identity — entity, space, types — so handing it the claim's is
 * exactly what it asks for. Empty `types` on purpose: that component refuses the panel to debates,
 * because a full-screen video experience is a poor fit for one (GEO-2794), and this is the claim,
 * which a panel serves well. That is the whole reason GEO-2879 can have what GEO-2794 refused.
 */
function DebateCardTitle({
  item,
  debate,
  opensSidePanel,
}: {
  item: ExploreFeedItem;
  debate: Debate | null;
  opensSidePanel: boolean;
}) {
  const heading = (
    <h2 className="mt-0! text-[19px]! leading-[23px]! font-semibold! tracking-[-0.02em] text-text hover:underline">
      {debate ? debate.claim.claim : item.title}
    </h2>
  );

  if (!debate) {
    return (
      <ExploreCardEntityLink item={item} opensSidePanel={opensSidePanel}>
        {heading}
      </ExploreCardEntityLink>
    );
  }

  // The claim's own space, not the card's. They are the same space today — a debate is published
  // to the space its claim lives in, which is why the transcript-claims lookup above scopes by
  // this same field — but the claim is what the link resolves, so it answers for its own home.
  //
  // Both ids normalized: geo-chat hands these back as UUIDs where the graph, and every route and
  // panel target in explore, spells them as plain hex.
  const claimIdentity = {
    entityId: ID.uuidToHex(debate.claim.claim_entity_id),
    spaceId: ID.uuidToHex(debate.claim.space_id),
    types: [],
  };

  return (
    <ExploreCardEntityLink item={claimIdentity} opensSidePanel={opensSidePanel}>
      {heading}
    </ExploreCardEntityLink>
  );
}

// Separate component so useDebateVotes (which queries as soon as it mounts) only runs once the
// debate is loaded and known to be watchable.
function DebateCardVideos({ debate, active, preload }: { debate: Debate; active: boolean; preload: boolean }) {
  const votes = useDebateVotes(debate);
  return <DebateFeedPlayer debate={debate} active={active} preload={preload} votes={votes} />;
}

function DebateVideoSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <div className="aspect-480/289 w-full animate-pulse rounded-lg bg-grey-01" />
      <div className="aspect-480/289 w-full animate-pulse rounded-lg bg-grey-01" />
    </div>
  );
}
