'use client';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { DebateClaimsPanel } from '~/core/debates/browse/debate-claims-panel';
import { DebateFeedPlayer } from '~/core/debates/browse/debate-feed-player';
import { getShareAriaLabel } from '~/core/debates/browse/debate-interaction-bar';
import { Share } from '~/core/debates/browse/icons';
import { useDebateShareAction } from '~/core/debates/browse/use-debate-share-action';
import { useDebate, useDebateMedia } from '~/core/debates/hooks';
import { hasProcessedVideo, isWatchableDebate } from '~/core/debates/playback-utils';
import { useDebateVotes } from '~/core/debates/use-debate-votes';
import { formatExploreRelativeTime } from '~/core/explore/explore-relative-time';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { ID } from '~/core/id';
import { useDebatesEnabled } from '~/core/state/feature-flags';
import { NavUtils } from '~/core/utils/utils';

import { InfoSmall } from '~/design-system/icons/info-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Tooltip } from '~/design-system/tooltip';

import { EntityRowActions } from '~/partials/entity-page/entity-row-actions';

import { ExploreCommentsIcon } from './explore-comments-icon';
import { SpaceThumb } from './space-thumb';

type DebateExploreFeedCardProps = {
  item: ExploreFeedItem;
  /** Hide the space thumbnail + space-name link in the meta row (same semantics as ExploreFeedCard). */
  hideSpaceLink?: boolean;
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
export function DebateExploreFeedCard({ item, hideSpaceLink = false, fallback }: DebateExploreFeedCardProps) {
  const debatesEnabled = useDebatesEnabled();
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
  const [active, setActive] = React.useState(false);
  React.useEffect(() => {
    if (!container) return;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          setActive(entry.isIntersecting && entry.intersectionRatio >= 0.6);
        }
      },
      { threshold: [0.6] }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  const enabled = debatesEnabled && nearViewport;
  const debateQuery = useDebate(debateId, enabled);
  const debate = debateQuery.data;
  const watchable = debate != null && isWatchableDebate(debate);

  // Same two-stage gate as the full-screen feed (GEO-2412): both recordings existing doesn't
  // prove the media job produced a playable final video.
  const mediaQuery = useDebateMedia(debateId, enabled && watchable);
  const processed = hasProcessedVideo(mediaQuery.data);

  const notWatchable =
    debateQuery.isError || (debate != null && !watchable) || mediaQuery.isError || (mediaQuery.data != null && !processed);

  if (!debatesEnabled || notWatchable) {
    return <>{fallback}</>;
  }

  const readyDebate = debate != null && watchable && processed ? debate : null;
  const timeAgo = formatExploreRelativeTime(item.createdAtSec);
  const entityHref = `${NavUtils.toEntity(item.spaceId, item.entityId)}#entity-comments`;

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

      <Link href={NavUtils.toEntity(item.spaceId, item.entityId)}>
        <h2 className="mt-0! text-[19px]! leading-[23px]! font-semibold! tracking-[-0.02em] text-text hover:underline">
          {item.title}
        </h2>
      </Link>

      {/* Cap the media at the width the designs (and the full-screen feed) use — feed columns,
          especially data blocks, can be much wider and full-bleed videos dwarf the card. */}
      <div className="w-full max-w-[480px]">
        {readyDebate ? <DebateCardVideos debate={readyDebate} active={active} /> : <DebateVideoSkeleton />}
      </div>

      <EntityRowActions entityId={item.entityId} spaceId={item.spaceId} className="mt-1">
        <Link href={entityHref} className="inline-flex items-center gap-1.5 text-grey-04 transition-colors hover:text-text">
          <ExploreCommentsIcon className="text-grey-04" />
          <span className="text-[14px] font-normal tabular-nums">{item.commentCount}</span>
        </Link>
        {readyDebate ? <DebateCardExtras debate={readyDebate} active={active} /> : null}
      </EntityRowActions>
    </article>
  );
}

/**
 * The Claims and Share actions from the full-screen feed's interaction bar, restyled to sit in the
 * explore card's footer. Claims opens the same DebateClaimsPanel (as a right-hand overlay, since
 * the explore feed has no side rail); Share drives the same prepared-social-video state machine.
 */
function DebateCardExtras({ debate, active }: { debate: Debate; active: boolean }) {
  const [claimsOpen, setClaimsOpen] = React.useState(false);
  const shareAction = useDebateShareAction(debate, active);
  const shareUnavailable = shareAction.state === 'preparing' || shareAction.state === 'sharing';

  const shareButton = (
    <button
      type="button"
      aria-label={getShareAriaLabel(shareAction)}
      aria-disabled={shareUnavailable}
      onClick={() => {
        if (!shareUnavailable) shareAction.onActivate();
      }}
      className="inline-flex items-center gap-1.5 text-grey-04 transition-colors hover:text-text aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    >
      <Share />
      <span className="text-[14px] font-normal">Share</span>
    </button>
  );

  return (
    <>
      <button
        type="button"
        aria-label="Claims"
        onClick={() => setClaimsOpen(true)}
        className="inline-flex items-center gap-1.5 text-grey-04 transition-colors hover:text-text"
      >
        <InfoSmall />
        {/* Claims are still a placeholder upstream — the full-screen feed passes 0 too. */}
        <span className="text-[14px] font-normal tabular-nums">0</span>
      </button>
      {shareAction.tooltipMessage ? (
        <Tooltip trigger={shareButton} label={shareAction.tooltipMessage} position="top" />
      ) : (
        shareButton
      )}
      {claimsOpen ? (
        <div className="fixed inset-y-0 right-0 z-100 flex bg-white shadow-card">
          <DebateClaimsPanel debate={debate} count={0} onClose={() => setClaimsOpen(false)} />
        </div>
      ) : null}
    </>
  );
}

// Separate component so useDebateVotes (which queries as soon as it mounts) only runs once the
// debate is loaded and known to be watchable.
function DebateCardVideos({ debate, active }: { debate: Debate; active: boolean }) {
  const votes = useDebateVotes(debate);
  return <DebateFeedPlayer debate={debate} active={active} votes={votes} />;
}

function DebateVideoSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <div className="aspect-480/289 w-full animate-pulse rounded-lg bg-grey-01" />
      <div className="aspect-480/289 w-full animate-pulse rounded-lg bg-grey-01" />
    </div>
  );
}
