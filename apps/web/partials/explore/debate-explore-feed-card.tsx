'use client';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { DebateClaimsPanel } from '~/core/debates/browse/debate-claims-panel';
import { DebateFeedPlayer } from '~/core/debates/browse/debate-feed-player';
import { DebateInteractionBar } from '~/core/debates/browse/debate-interaction-bar';
import { DebateShareDialog } from '~/core/debates/browse/share-dialog';
import { useDebateShareAction } from '~/core/debates/browse/use-debate-share-action';
import { useDebatePlaybackAllowed } from '~/core/debates/debate-playback-gate';
import { useDebate, useDebateMedia } from '~/core/debates/hooks';
import { hasProcessedVideo, isWatchableDebate } from '~/core/debates/playback-utils';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { formatExploreRelativeTime } from '~/core/explore/explore-relative-time';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { useCommentCount } from '~/core/hooks/use-comment-count';
import { useEntityCommentsPanel } from '~/core/hooks/use-entity-comments-panel';
import { useNearViewport } from '~/core/hooks/use-near-viewport';
import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

import { FullscreenLink } from '~/design-system/fullscreen-link';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ExploreCardTitle } from './explore-card-title';
import { ExploreJoinSpaceButton } from './explore-join-space-button';
import { SpaceThumb } from './space-thumb';

/** Visible fraction at which a card takes over playback, and the one it must fall back to
 * before it gives it up. Strictly between them the card keeps whatever state it had. */
const ACTIVATE_RATIO = 0.6;
const DEACTIVATE_RATIO = 0.4;

/**
 * How wide the card's column — meta row, title, media and bar — is allowed to get.
 *
 * Width is what sets height here, so this is really a height budget. The two tiles are
 * `aspect-480/289` with an 8px gap between them, so the media is `1.2042 × width + 8` — measured
 * at 682px against a predicted 682.3px on a 560px column. Everything else is a reserve, and
 * `calc(83dvh - 178px)` is `width ≤ (dvh − 44 − 170) / 1.2042`: the 44px app header, and ~170px
 * for the card's own chrome.
 *
 * That reserve is deliberately loose rather than exact, because the chrome is not one fixed
 * number. Measured, it is 128px with a one-line heading and 151px with the two lines the clamp
 * allows — leaving about 19px spare at the worst case the heading can reach.
 *
 * Which is what absorbs a meta row that wraps. That row is `flex-wrap`, and its widest state
 * ("Membership pending" beside a long space name) does take a second line — measured at 41px
 * against the usual 24px. It only does so once the column is down at its 320px floor, where the
 * clamp has stopped binding and there is far more than 17px going spare; and even inside the
 * binding range the worst case would be 168px against the 170px reserved. Verified by measurement
 * across widths 390–1440 and heights 600–1000 with that state forced: nothing overflows.
 *
 * So the column tracks the viewport rather than sitting at a fixed 480px — 486px at an 800px
 * viewport, 403px at 700px — up to the 560px cap, which the budget clears from about an 890px
 * viewport and which is there so a tall display gets a wider card and not a different design.
 * The 320px floor gives the promise up below roughly a 600px viewport, where honouring it would
 * mean a video too small to read a face in.
 *
 * The same trick, and the same reason, as `--debate-feed-column-width` on the full-screen feed:
 * `dvh` there too, because the media has to fit the viewport it is being watched in.
 *
 * Keep the arithmetic and the layout together — a change to `py-4`, the title clamp, the bar or
 * the media gap moves the 178px, and nothing else will notice.
 */
const DEBATE_CARD_COLUMN_STYLE = {
  '--debate-card-column-width': 'clamp(320px, calc(83dvh - 178px), 560px)',
} as React.CSSProperties;

type DebateExploreFeedCardProps = {
  item: ExploreFeedItem;
  /** Hide the space thumbnail + space-name link in the meta row (same semantics as ExploreFeedCard). */
  hideSpaceLink?: boolean;
  /** Hide the Join-space chip in the meta row (same semantics as ExploreFeedCard). */
  hideJoinButton?: boolean;
  /** Whether the claim title opens the side panel rather than navigating (same semantics as ExploreFeedCard). */
  titleOpensSidePanel?: boolean;
  /** Use the shorter, side-by-side player intended for the profile Activity gallery. */
  compactPlayer?: boolean;
  /** Transfer playback ownership when this debate's player is clicked. */
  onPlaybackRequest?: (debateId: string) => void;
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
 * same interaction bar, framed in the explore card chrome — meta row, claim title, media sized to
 * the viewport, and a control that opens this debate at full size.
 *
 * Both renditions render `DebateFeedPlayer` and `DebateInteractionBar`, so everything inside the
 * debate itself — the videos, the debater identities and position chips, the winner share, the
 * vote pill and the counts — is one component in both places rather than two that look alike
 * (GEO-2912).
 */
export function DebateExploreFeedCard({
  item,
  hideSpaceLink = false,
  hideJoinButton = false,
  titleOpensSidePanel = false,
  compactPlayer = false,
  onPlaybackRequest,
  fallback,
}: DebateExploreFeedCardProps) {
  // A Debate entity's id is its geo-chat debate id (see useDebateVotes), modulo hyphenation.
  const debateId = ID.hexToUuid(item.entityId);

  // The feed retains every fetched row, so proximity has to govern the lifetime of the expensive
  // subtree, not just its first request. Once this card leaves the window, unmounting the player
  // releases both video elements and unsubscribes its playback/vote/transcript consumers. Query
  // data remains in TanStack's cache, so reverse scrolling can rebuild without turning every old
  // card into a permanently live media player (GEO-2963).
  const { element: container, ref: setContainer, nearViewport } = useNearViewport({ sticky: false });

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

  // A veto, not a replacement: where a surface holds playback to one debate —
  // a row of cards, all of them fully on screen at once — this says whether it
  // is this one's turn. A card that is allowed but scrolled away still stops,
  // because its own judgement above is unchanged.
  const playbackAllowed = useDebatePlaybackAllowed(debateId);

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

  /**
   * Whether this card is carrying a debate's resources at all.
   *
   * The same window that governs the player (GEO-2963), because the controls needing a debate are
   * part of what that window releases: leaving it drops the two video elements, and it drops the
   * transcript-claims subscription behind the Claims count with them. A row deep in the feed keeps
   * its votes and its comment count — neither asks geo-chat anything — and gets the rest back on
   * the way past.
   */
  const mediaMounted = readyDebate != null && nearViewport;

  // The interaction state lives on the card rather than inside the bar: the bar is shared with the
  // full-screen feed and stays presentational, so what a control opens — the claims overlay, the
  // share dialog, the app's comments panel — is the card's to own and to render once. Same
  // arrangement, same reason, as `DebateFeedItem` on the full-screen feed.
  const [claimsOpen, setClaimsOpen] = React.useState(false);
  const share = useDebateShareAction();
  const { commentsTarget, openComments } = useEntityCommentsPanel();
  // Nulls read as "not enabled", which is how the count stands down with the media above. Shares a
  // cache entry with the Claims panel, so opening the panel doesn't refetch what this loaded.
  const { claims } = useDebateTranscriptClaims(
    mediaMounted ? readyDebate.id : null,
    mediaMounted ? readyDebate.claim.space_id : null
  );
  // The feed's count is server-rendered and frozen: posting from the panel this pill opens writes
  // the new row into the comments cache and nothing re-runs that count, so the number sat one
  // behind the list it describes until a reload. This follows the cache instead, and costs no
  // request — it subscribes without enabling a query. Reached through `EntityCommentsButton`
  // before the shared bar replaced it, which is how it went missing.
  const commentCount = useCommentCount(item.entityId, item.commentCount);

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
   *  - The comment count starts from the one the explore feed server-rendered for the card and
   *    then follows the comments cache, rather than reading a thread of its own per card.
   *  - Claims and Share stand down until the debate is both resolved and in the media window —
   *    votes and comments need no debate, those two do — so the footer is present from the first
   *    paint and doesn't shift the card under the reader when the geo-chat lookups land.
   */
  const interactionProps = {
    entityId: item.entityId,
    spaceId: item.spaceId,
    commentCount,
    commentsPanelOpen: commentsTarget?.entityId === item.entityId,
    onComment: () => openComments(item.entityId, item.spaceId),
    claimsCount: claims.totalCount,
    // See the prop's own note: an explore card can be a data block row listing a debate from
    // another space, and only the lookup finds that space's votes.
    responseKind: 'infer' as const,
    onClaims: mediaMounted ? () => setClaimsOpen(true) : undefined,
    onShare: mediaMounted ? share.onOpen : undefined,
    shareOpen: share.open,
  };

  return (
    <article ref={setContainer} className="flex flex-col gap-2 border-b border-divider py-4 last:border-b-0">
      {/* Meta, title, media and the interaction bar share one column, capped so the whole card
          fits the viewport it is watched in — see {@link DEBATE_CARD_COLUMN_STYLE}. A cap rather
          than the full column width because feed columns, especially data blocks, can be much
          wider and a full-bleed video dwarfs the card. Capping the column rather than the media
          alone is what lines "Join a debate" up with the videos' right edge instead of the card's,
          and what keeps the bar beneath the videos the same width as them. */}
      <div
        className="flex w-full max-w-[var(--debate-card-column-width)] min-w-0 flex-col gap-2"
        style={DEBATE_CARD_COLUMN_STYLE}
      >
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
          {/* The way out of the card and into the debate at full size.
           *
           * This corner used to hold "View all", a link to the space's whole debates list. Since
           * GEO-2879 headed the card with the claim, nothing on the card pointed at the debate
           * itself any more — the open question in that ticket's notes, which asked where the path
           * to the full-screen debate would go once the title stopped being it. Here.
           *
           * The Debate entity's own page is that path: `DebateEntityView` renders it as the
           * `/debates` feed anchored to this debate, which is the full-screen experience with this
           * debate on top. So this is the entity link the title used to be, moved to a control
           * that says "bigger" rather than competing with the claim for the heading.
           *
           * `FullscreenLink` so it reads as the same offer a data block's header makes, which is
           * where this control's styling comes from. */}
          <FullscreenLink
            href={NavUtils.toEntity(item.spaceId, item.entityId)}
            entityId={item.entityId}
            spaceId={item.spaceId}
            ariaLabel="Watch this debate full screen"
          />
        </div>

        {/* Two lines, as the full-screen header clamps the same claim to, and what this card's
            height budget is calculated against — a third line is 23px the viewport was not
            promised. Only the debate card asks for it, because only the debate card has fixed
            aspect-ratio media whose height follows from the space the title leaves it. */}
        <ExploreCardTitle item={item} opensSidePanel={titleOpensSidePanel} clamped />

        <div onClickCapture={() => onPlaybackRequest?.(debateId)}>
          {mediaMounted ? (
            // The recordings resolve while the card is still approaching. Crossing back out of
            // that same window unmounts this subtree instead of retaining two paused videos forever.
            <DebateCardVideos debate={readyDebate} active={active && playbackAllowed} compact={compactPlayer} />
          ) : (
            <DebateVideoSkeleton compact={compactPlayer} />
          )}
        </div>

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

      {/* On `readyDebate`, not on `mediaMounted` like the controls that open these. What the media
          window governs is what a card holds while nobody is looking at it; something already open
          is being looked at. Both of these are fixed overlays over a feed that still scrolls, so
          gating them on the window meant scrolling past the card they came from tore the panel
          away mid-read — and, because the open flags live on the card now rather than in a subtree
          that unmounted with them, left them set, so scrolling back reopened it unasked. The
          claims panel loads its own claims, so it does not go empty when the card's count stands
          down beside it. */}
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

// Separated and memoized because the card above it subscribes to the global comments-panel atom —
// it has to tell the bar whether the panel is open on this debate — so opening comments anywhere
// re-renders every debate card in the feed. `debate` is a stable react-query object and `active`
// is a boolean, so on a change that is only about the panel this skips the player and its playback
// hooks entirely. (A re-render never interrupted playback — the <video> keeps its identity — but
// there is no reason to re-run the whole subtree for a flag it does not read.)
const DebateCardVideos = React.memo(function DebateCardVideos({
  debate,
  active,
  compact,
}: {
  debate: Debate;
  active: boolean;
  compact: boolean;
}) {
  return <DebateFeedPlayer debate={debate} active={active} compact={compact} preload />;
});

function DebateVideoSkeleton({ compact }: { compact: boolean }) {
  return (
    <div className={compact ? 'grid grid-cols-2' : 'flex flex-col gap-2'} aria-hidden="true">
      <div className="aspect-480/289 w-full animate-pulse rounded-lg bg-grey-01" />
      <div className="aspect-480/289 w-full animate-pulse rounded-lg bg-grey-01" />
    </div>
  );
}
