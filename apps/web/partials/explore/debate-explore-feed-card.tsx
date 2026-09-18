'use client';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { DebateClaimsPanel } from '~/core/debates/browse/debate-claims-panel';
import { DebateFeedPlayer } from '~/core/debates/browse/debate-feed-player';
import { DebateShareDialog } from '~/core/debates/browse/share-dialog';
import { useDebateShareAction } from '~/core/debates/browse/use-debate-share-action';
import { useDebate, useDebateMedia } from '~/core/debates/hooks';
import { hasProcessedVideo, isWatchableDebate } from '~/core/debates/playback-utils';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { useDebateVotes } from '~/core/debates/use-debate-votes';
import { formatExploreRelativeTime } from '~/core/explore/explore-relative-time';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { EntityCommentsButton } from '~/partials/comments/entity-comments-button';
import { EntityRowActions } from '~/partials/entity-page/entity-row-actions';

import { ExploreCardTitle } from './explore-card-title';
import { ExploreClaimsIcon } from './explore-claims-icon';
import { ExploreJoinSpaceButton } from './explore-join-space-button';
import { ExploreShareIcon } from './explore-share-icon';
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
 * the full-screen `/debates` feed (autoplaying muted while in view, with winner voting), framed
 * in the explore card chrome — meta row, claim title, and the standard entity actions.
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

  if (notWatchable) {
    return <>{fallback}</>;
  }

  const readyDebate = debate != null && watchable && processed ? debate : null;
  const timeAgo = formatExploreRelativeTime(item.createdAtSec);

  return (
    <article ref={setContainer} className="flex flex-col gap-2 border-b border-divider py-4 last:border-b-0">
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
            // The design puts the join CTA as a compact chip beside the space name (the right
            // side holds "View all"), unlike the generic card's right-aligned button.
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
        <Link
          href={`/space/${item.spaceId}/debates`}
          className="flex h-7 shrink-0 items-center rounded-full border border-grey-02 px-[11px] text-[14px] leading-[13px] font-normal tracking-[-0.35px] text-text hover:border-text"
        >
          View all
        </Link>
      </div>

      <ExploreCardTitle item={item} opensSidePanel={titleOpensSidePanel} />

      {/* Cap the media at the width the designs (and the full-screen feed) use — feed columns,
          especially data blocks, can be much wider and full-bleed videos dwarf the card. */}
      <div className="w-full max-w-[480px]">
        {readyDebate ? (
          // `nearViewport` is the same 800px-margin gate the geo-chat lookups already use, so
          // the recordings resolve while the card is still approaching rather than on arrival.
          <DebateCardVideos debate={readyDebate} active={active} preload={nearViewport} />
        ) : (
          <DebateVideoSkeleton />
        )}
      </div>

      <EntityRowActions entityId={item.entityId} spaceId={item.spaceId} className="mt-1">
        <EntityCommentsButton entityId={item.entityId} spaceId={item.spaceId} count={item.commentCount} />
        {readyDebate ? <DebateCardExtras debate={readyDebate} spaceId={item.spaceId} /> : null}
      </EntityRowActions>
    </article>
  );
}

/**
 * The Claims and Share actions from the full-screen feed's interaction bar, restyled to sit in the
 * explore card's footer. Claims opens the same DebateClaimsPanel (as a right-hand overlay, since
 * the explore feed has no side rail); Share opens the same DebateShareDialog.
 */
function DebateCardExtras({ debate, spaceId }: { debate: Debate; spaceId: string }) {
  const [claimsOpen, setClaimsOpen] = React.useState(false);
  const { claims } = useDebateTranscriptClaims(debate.id, debate.claim.space_id);
  const share = useDebateShareAction();

  return (
    <>
      <button
        type="button"
        aria-label="Claims"
        onClick={() => setClaimsOpen(true)}
        className="inline-flex items-center gap-1.5 text-grey-04 transition-colors hover:text-text"
      >
        <ExploreClaimsIcon />
        <span className="text-[14px] font-normal tabular-nums">{claims.totalCount}</span>
      </button>
      <button
        type="button"
        aria-label="Share debate"
        aria-haspopup="dialog"
        aria-expanded={share.open}
        onClick={share.onOpen}
        className="inline-flex items-center gap-1.5 text-grey-04 transition-colors hover:text-text"
      >
        <ExploreShareIcon />
        <span className="text-[14px] font-normal">Share</span>
      </button>
      <DebateShareDialog
        open={share.open}
        onOpenChange={share.onOpenChange}
        debate={debate}
        spaceId={spaceId}
        openerRef={share.openerRef}
      />
      {claimsOpen ? (
        <div className="fixed inset-y-0 right-0 z-100 flex bg-white shadow-card">
          <DebateClaimsPanel debate={debate} onClose={() => setClaimsOpen(false)} />
        </div>
      ) : null}
    </>
  );
}

// Separate component so useDebateVotes (which queries as soon as it mounts) only runs once the
// debate is loaded and known to be watchable.
function DebateCardVideos({
  debate,
  active,
  preload,
}: {
  debate: Debate;
  active: boolean;
  preload: boolean;
}) {
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
