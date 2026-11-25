'use client';

import * as React from 'react';

import cx from 'classnames';
import { useSetAtom } from 'jotai';

import { ActionSurfaceArticle, useActionScope } from '~/core/action-context-provider';
import type { Debate } from '~/core/debates/api';
import { DebateClaimFooter } from '~/core/debates/browse/debate-claim-footer';
import { DebateFeedPlayer } from '~/core/debates/browse/debate-feed-player';
import { DebateInteractionBar } from '~/core/debates/browse/debate-interaction-bar';
import { DebateMediaModeToggle, useDebateMediaMode } from '~/core/debates/browse/debate-media-mode';
import { DEBATE_FEED_HOLDS_FULL_PLAYBACK } from '~/core/debates/browse/feed-full-playback';
import { useInlinePlaybackUnavailable } from '~/core/debates/browse/inline-playback';
import { DebateShareDialog } from '~/core/debates/browse/lazy-share-dialog';
import { useDebateShareAction } from '~/core/debates/browse/use-debate-share-action';
import { compositeTopSlot } from '~/core/debates/composite-top-slot';
import { clickAsksToPlay, useDebateCardPlayback } from '~/core/debates/debate-playback-gate';
import { useFeedPlayingCard } from '~/core/debates/feed-playing-card';
import { useDebate, useDebateMedia } from '~/core/debates/hooks';
import { MomentsCardPlayer } from '~/core/debates/moments-player/moments-card-player';
import { hasProcessedVideo, isWatchableDebate } from '~/core/debates/playback-utils';
import { fallBackToDurableStill, speakerStillContentUrl } from '~/core/debates/speaker-still';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { useCommentCount } from '~/core/hooks/use-comment-count';
import { useEntityCommentsPanel } from '~/core/hooks/use-entity-comments-panel';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { useNearViewport } from '~/core/hooks/use-near-viewport';
import { ID } from '~/core/id';
import { useCoveredByMobileSheet } from '~/core/state/mobile-sheet-cover';
import { NavUtils } from '~/core/utils/utils';

import { FullscreenLink } from '~/design-system/fullscreen-link';

import { DebateExploreMetaRow } from './debate-explore-meta-row';
import { ExploreCardTitle } from './explore-card-title';
import { openExploreDebateClaimsPanelAtom } from '~/atoms';

/** Visibility thresholds, relative to the viewport height when the card is taller than it.
 * Strictly between them the card keeps whatever state it had. */
const ACTIVATE_RATIO = 0.6;
const DEACTIVATE_RATIO = 0.4;

/**
 * The debates app's card (GEO-3833, debates-react-native `CardSurface.tsx` / `LiveMomentCard.tsx`):
 * white, a 26px radius, a 1px #e5e5e5 outline, 16px of padding and a soft shadow, at most 480px
 * wide, with the media inset in it at a 20px radius.
 *
 * The card keeps its width; the **media** narrows to keep the vote row on screen, as the app's
 * `feedCardMedia` does, and the claim and the votes keep the card's full width under it. The two
 * tiles are `aspect-480/289` with no gap, so the media is `width × 578/480` tall, and its width is
 *
 *   `(100svh − 44px navbar − 32px feed gap − chrome) × 480/578`
 *
 * where the chrome is everything in the card that is not the media:
 *   34 (16px padding top and bottom and the 1px outline) + 28 (the moments row the moments card
 *   draws above the clip on desktop, held now so that card does not move this one; 0 on phones,
 *   where its bar sits over the clip) + 40 (the 24px meta line under the media and the 16px above
 *   it) + 40 (the claim's 20px above and 20px below) + 54 (two 27px claim lines, the clamp) + 44
 *   (the vote row) = **240px on desktop, 212px on phones**.
 *
 * At 1366×768 that is (768 − 76 − 240) × 0.8304 = 375px of media; at 1440×900 it is 485px, capped
 * by the card to 448px (480 − 32). Never under 280px, where a face is too small to read, so a very
 * short window gives up the promise rather than the picture. The results row the app shows after a
 * vote (64px) is not reserved, as in the app: the vote row stays where it was tapped, and the
 * results are a small scroll below it.
 *
 * `svh` rather than `dvh`: a phone browser's toolbars collapse and return as the page scrolls, and a
 * card sized by `dvh` changed width under the reader on every scroll (GEO-3454). The small viewport
 * is the one with the toolbars showing, so the media is sized for the worst case and holds still.
 *
 * Keep the arithmetic and the layout together — a change to the card's padding, the claim's size or
 * clamp, the vote row or the meta line moves the chrome, and nothing else will notice.
 */
const DEBATE_CARD_MEDIA_WIDTH = 'clamp(280px, calc((100svh - 76px - var(--debate-card-chrome)) * 480 / 578), 100%)';

const DEBATE_CARD_STYLE = { '--debate-card-media-width': DEBATE_CARD_MEDIA_WIDTH } as React.CSSProperties;

type DebateExploreFeedCardProps = {
  item: ExploreFeedItem;
  /** Hide the space thumbnail + space-name link in the meta row (same semantics as ExploreFeedCard). */
  hideSpaceLink?: boolean;
  /** Hide the Join-space chip in the meta row (same semantics as ExploreFeedCard). */
  hideJoinButton?: boolean;
  /** Whether the claim title opens the side panel rather than navigating (same semantics as ExploreFeedCard). */
  titleOpensSidePanel?: boolean;
  /**
   * A ~300px gallery tile (a profile's Activity). The same card as everywhere else (GEO-3833), fitted
   * to the tile: tighter padding and no shadow (the rail clips it), the media at the tile's width
   * rather than the viewport's height, the compact meta row and Moments / Full debate button, and
   * the player's reduced overlays. At this width the vote pills drop their labels, as the app's do.
   */
  compactChrome?: boolean;
  /**
   * Raise the card's ceiling from 480px to the container's own width. For a surface whose column is
   * already the reading width, where the capped card sat narrower than everything around it — the
   * claim page's Record tab.
   *
   * Not "uncapped": the media still narrows to the viewport's height, so the whole card still fits
   * the screen it is watched on; the claim and the votes take the full width under it. See
   * {@link DEBATE_CARD_MEDIA_WIDTH}.
   */
  fullWidth?: boolean;
  /** Additional action placed beside the full-screen link. */
  endSlot?: React.ReactNode;
  /**
   * Rendered instead of the debate card when the debate can't be shown as a video — feature flag
   * off, the geo-chat record is missing or unwatchable, or its final video isn't processed yet.
   * Mirrors the fallback pattern of DebateEntityView so a Debate entity is never hidden outright.
   */
  fallback: React.ReactNode;
};

/**
 * The explore-feed rendition of a published Debate: the same two synchronized debater videos as
 * the full-screen `/debates` feed (in a feed autoplaying muted while in view, elsewhere waiting for a
 * tap — see `debate-playback-gate.tsx`; with winner voting), in the same
 * card — the claim and the reader's side on it under the media, which is sized to the viewport —
 * with a control that opens this debate at full size.
 *
 * Both renditions render `DebateFeedPlayer` and `DebateClaimFooter`, so everything about the debate
 * itself — the videos, the debater identities and position chips, the winner share, the claim's
 * pills and split, and the counts — is one component in both places rather than two that look
 * alike (GEO-2912, GEO-3454).
 */
export function DebateExploreFeedCard({
  item,
  hideSpaceLink = false,
  hideJoinButton = false,
  titleOpensSidePanel = false,
  compactChrome = false,
  fullWidth = false,
  endSlot,
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
  // card can clear 0.6, and activation only ever moves — these cards scroll freely, several can be
  // on screen at once, and nothing else holds a card active. Each toggle starts or interrupts a
  // playback attempt, which is what made scrolling feel glitchy (GEO-2895).
  //
  // Reach 0.6 to activate, fall back to 0.4 to give it up, and hold between them. For a card taller
  // than the viewport, measure against the viewport's height instead: a full-width landscape card
  // cannot expose 60% of itself. Scale the observer's thresholds too, so it actually reports those
  // crossings. Resize only the observation when the card or viewport changes, never the card.
  const [active, setActive] = React.useState(false);
  // Any part of the card on screen. The observer reports crossing in and out of view as well as
  // its two thresholds, so this needs no threshold of its own.
  const [onScreen, setOnScreen] = React.useState(false);
  React.useEffect(() => {
    if (!container) return;
    let observer: IntersectionObserver | undefined;
    let observedHeight = -1;
    let observedViewportHeight = -1;
    const observeVisibility = () => {
      const height = container.getBoundingClientRect().height;
      const viewportHeight = window.innerHeight;
      if (height === observedHeight && viewportHeight === observedViewportHeight) return;
      observedHeight = height;
      observedViewportHeight = viewportHeight;
      observer?.disconnect();

      // Keep the horizontal intersection in the ratio: a gallery card clipped at the rail's edge
      // must still earn its visible width. Only the unattainable vertical fraction is removed.
      const scale = height > 0 && viewportHeight > 0 ? Math.min(1, viewportHeight / height) : 1;
      const activateAt = ACTIVATE_RATIO * scale;
      const deactivateAt = DEACTIVATE_RATIO * scale;
      observer = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            setOnScreen(entry.isIntersecting);
            setActive(current => {
              if (!entry.isIntersecting) return false;
              if (entry.intersectionRatio >= activateAt) return true;
              if (entry.intersectionRatio <= deactivateAt) return false;
              return current;
            });
          }
        },
        { threshold: [deactivateAt, activateAt] }
      );
      observer.observe(container);
    };
    observeVisibility();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(observeVisibility);
    resizeObserver?.observe(container);
    window.addEventListener('resize', observeVisibility);
    return () => {
      observer?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', observeVisibility);
    };
  }, [container]);

  /*
   * Whether this card is the one the viewer is scrolling towards: its top in the lower three
   * quarters of the screen or within one screen below it, and not yet active. The player loads such a card's
   * opening seconds (its `buffer`) so it starts the moment it is reached instead of on its clips.
   * Ahead only — a card the viewer has scrolled past is not coming back on its own.
   *
   * Its own observer, on a root extended one screen down, with enough thresholds to notice a card
   * leaving through the top as well as one arriving from below.
   */
  const [upNext, setUpNext] = React.useState(false);
  React.useEffect(() => {
    if (!container) return;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const viewportHeight = entry.rootBounds?.height ?? window.innerHeight;
          setUpNext(entry.isIntersecting && entry.boundingClientRect.top > viewportHeight / 4);
        }
      },
      { rootMargin: '0px 0px 100% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  // Only a feed's cards start themselves (GEO-3812). Anywhere else — a profile's record, a claim's
  // debates, a gallery, a table block — the card shows its stills and Play until it is tapped, and
  // then it is the one debate playing in the app. See `debate-playback-gate.tsx`.
  // This card, not just this debate: the same debate can be on two surfaces at once.
  const owner = React.useId();
  // A veto, not a replacement: a feed card still plays only while it is in view, and yields while a
  // debate tapped elsewhere plays; a tap-to-play card plays only once it is tapped.
  const {
    tapToPlay,
    allowed: playbackAllowed,
    isTapped,
    tap,
    release: releaseTap,
    reclaim: reclaimPlayback,
  } = useDebateCardPlayback(debateId, owner);
  // A card nobody can see stops playing and lets go of its media: behind a mobile sheet (the side
  // panel, the Debates hub), or off screen on the mobile layout. Paused video still holds its
  // decoders and buffered frames, and on a phone that adds up to a reloaded tab. The card keeps its
  // signed URLs, so it reattaches quickly (GEO-3067's `releaseMedia`). Cards inside a sheet, like a
  // profile's Activity gallery, are not covered by it. Desktop keeps off-screen cards loaded so
  // the next one starts at once.
  //
  // Outside a feed nothing plays next by itself, so there is no next card to keep ready: a card
  // holds its media only while it is on screen, on every layout. It holds it there, paused, so that
  // a tap on Play starts elements that already exist — inside the tap, which is what lets the
  // browser start it with sound.
  const coveredBySheet = useCoveredByMobileSheet();
  const isMobileLayout = useIsMobileLayout();
  // The card up next keeps its media too, so what it has loaded is there when it arrives.
  const releaseMedia = tapToPlay
    ? coveredBySheet || !onScreen
    : coveredBySheet || (isMobileLayout && !onScreen && !upNext);

  /*
   * Whether the player may run.
   *
   * A feed card runs while it is mostly in view (`active`). A tapped card runs from the tap, even if
   * less than 60% of it is showing yet: the tap started its elements, and holding them for the
   * scroll that brings it into view would stop them again under the viewer's finger.
   */
  // A feed card in view enough to play is a candidate; of the candidates on screen, only the one
  // nearest the middle plays, so two cards never play at once (GEO-3867, `useFeedPlayingCard`).
  const feedCandidate = !tapToPlay && active && playbackAllowed && !coveredBySheet;
  const playingHere = useFeedPlayingCard(owner, container, feedCandidate);
  const playerActive = tapToPlay ? playbackAllowed && onScreen && !coveredBySheet : playingHere;

  // A tap lasts as long as the viewer is watching this card: it is given up once the card leaves
  // the screen, goes behind a sheet, or scrolls back out of the active range it reached — so it
  // neither resumes when the card comes back nor lets anything else start in its place.
  const wasActiveRef = React.useRef(active);
  React.useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = active;
    if (!tapToPlay || !isTapped) return;
    if (!onScreen || coveredBySheet || (wasActive && !active)) releaseTap();
  }, [active, coveredBySheet, isTapped, onScreen, releaseTap, tapToPlay]);

  const debateQuery = useDebate(debateId, nearViewport);
  const debate = debateQuery.data;
  const watchable = debate != null && isWatchableDebate(debate);
  // The stills stand in the order the player will draw, so the speakers do not swap as it takes over.
  // Where inline playback is unavailable (TikTok) that player is the combined one, which plays the
  // server's composite with slot 1 on top and cannot reorder it.
  const inlineUnavailable = useInlinePlaybackUnavailable();
  const topSlot = inlineUnavailable ? 1 : compositeTopSlot(debate?.participants);

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

  /*
   * Moments or the full debate (GEO-3833). A card with moments starts on them, and the button at the
   * video's top right switches; a debate without any, or one whose moments could not be read, has
   * the full debate and no button. See `useDebateMediaMode`.
   *
   * Nothing that loads the recordings mounts until the moments read settles, so a card does not
   * sign two recordings and then swap them for clips.
   */
  const media = useDebateMediaMode(debateId, { enabled: nearViewport });
  const reelMoments = media.reel;
  const reelPending = media.pending;

  /**
   * Whether this card is carrying a debate's resources at all.
   *
   * The same window that governs the player (GEO-2963): leaving it drops the two video elements,
   * and Share stands down with them. The claim footer stays drawn — its pills and split are part of
   * the card's height, and dropping them would move everything below as a card left the window —
   * and keeps the reads it has started, which are cheap and cached.
   */
  const mediaMounted = readyDebate != null && nearViewport && !notWatchable;

  const showReel = mediaMounted && reelMoments !== null && media.mode === 'moments';

  // Feed cards only: a click on a card that is not playing yet scrolls it into view. A tap-to-play
  // card does the same from `tapToPlayNow`, which only the player's own play controls call.
  const requestPlayback = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!clickAsksToPlay(event)) return;
    // A feed card yielding to a debate tapped outside the feed takes playback back in this same
    // click, so the press reaches a player that may run rather than one held a render later.
    if (!playbackAllowed) reclaimPlayback();
    // Let the player's handler keep the play request, but leave activation to visibility. Forcing
    // this card active in place could play it over the previous card, and a toolbar resize would
    // immediately undo that activation while it was still below the lower threshold.
    // A card in view that is not the one playing is brought to the middle, which makes it the one.
    if (!playingHere) container?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  };

  /*
   * A tap-to-play card's Play. The player calls it from inside the tap, and only from the controls
   * that ask to play (Play, the tile, Replay) — never from a vote or a link drawn over the media,
   * which is why it is the player's call rather than a capture on the whole wrapper. The player
   * starts its elements in that same tap; this makes the card the one allowed to keep playing, which
   * stops whatever was playing before, and brings it into view.
   */
  const tapToPlayNow = React.useCallback(() => {
    tap();
    if (!active) container?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [active, container, tap]);

  /*
   * The mode button. The other mode's player unmounts, which stops it and lets its elements go (back
   * to the gesture pool on iOS, already granted sound); the one shown starts as a player arriving in
   * view does, with the viewer's sound. On a tap-to-play card the press is also its Play.
   */
  const { showFull, showMoments: showMomentsMode } = media;
  const showFullDebate = React.useCallback(
    (startSeconds: number | null) => {
      showFull(startSeconds);
      if (tapToPlay) tapToPlayNow();
    },
    [showFull, tapToPlay, tapToPlayNow]
  );
  const showMoments = React.useCallback(() => {
    showMomentsMode();
    if (tapToPlay) tapToPlayNow();
  }, [showMomentsMode, tapToPlay, tapToPlayNow]);

  // The panel is drawn by `ExploreDebateClaimsPanelHost`, so the app has one of it and a card that
  // unmounts (paging, or sitting inside the entity side panel this replaces) doesn't take it along.
  // A ref: the merged scope is a fresh object each render.
  const scope = useActionScope();
  const scopeRef = React.useRef(scope);
  React.useEffect(() => {
    scopeRef.current = scope;
  });
  const setClaimsPanel = useSetAtom(openExploreDebateClaimsPanelAtom);
  // Stable, because `DebateCardVideos` is memoized and a fresh function each render would undo it.
  const openClaims = React.useCallback(() => {
    if (readyDebate) setClaimsPanel({ debateId, debate: readyDebate, scope: scopeRef.current });
  }, [debateId, readyDebate, setClaimsPanel]);
  const share = useDebateShareAction();
  const { commentsTarget, openComments } = useEntityCommentsPanel();
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

  /**
   * Comments and share differ from the full-screen feed only in where they come from and where they
   * lead, never in how they look:
   *  - Comments open the app's global panel, as they do from every other explore card, instead of
   *    the feed's own side rail.
   *  - The comment count starts from the one the explore feed server-rendered for the card and
   *    then follows the comments cache, rather than reading a thread of its own per card.
   *  - Share stands down until the debate is both resolved and in the media window — comments need
   *    no debate, share does — so the row is present from the first paint and doesn't shift the
   *    card under the reader when the geo-chat lookups land.
   */
  const actions = (
    <DebateInteractionBar
      commentCount={commentCount}
      commentsPanelOpen={commentsTarget?.entityId === item.entityId}
      onComment={() => openComments(item.entityId, item.spaceId, 'debate')}
      onShare={mediaMounted ? share.onOpen : undefined}
      shareOpen={share.open}
      variant="circles"
    />
  );

  return (
    <ActionSurfaceArticle ref={setContainer} className={cx('flex flex-col', !compactChrome && 'py-2')}>
      {/* The debates app's card surface, on every host — fitted to a gallery's tile there. See
          {@link DEBATE_CARD_MEDIA_WIDTH} for how the media is sized. */}
      <div
        data-debate-card-surface={compactChrome ? 'compact' : 'app'}
        className={cx(
          'flex w-full min-w-0 flex-col rounded-[26px] border border-[#e5e5e5] bg-white',
          compactChrome
            ? // The toggle's compact width, so the player's top-left controls stop short of it.
              'max-w-full p-3 [--debate-top-right-width:5.75rem]'
            : cx(
                'p-4 shadow-[0_8px_14px_rgba(0,0,0,0.075)]',
                '[--debate-card-chrome:240px] md:[--debate-card-chrome:212px]',
                fullWidth ? 'max-w-full' : 'max-w-[480px]'
              )
        )}
        style={compactChrome ? undefined : DEBATE_CARD_STYLE}
      >
        {/* The videos first, then the claim they argue and the reader's side on it — the same card
            the full-screen feed draws (GEO-3454). The player draws no corners of its own: the frame
            here clips it, inset in the app's card at the app's 20px. */}
        <div
          data-debate-card-media=""
          data-debate-card-reel={showReel || undefined}
          className={cx(
            // A gallery tile is a rail's, not the viewport's: its media takes the tile's width.
            compactChrome ? 'w-full' : 'mx-auto w-[var(--debate-card-media-width)] max-w-full',
            // The reel draws its own moments row above its frame, so the frame is its own too.
            !showReel && 'overflow-hidden rounded-[20px] bg-[#151515]'
          )}
          onClickCapture={mediaMounted && !tapToPlay ? requestPlayback : undefined}
        >
          {showReel ? (
            <MomentsCardPlayer
              debate={readyDebate}
              moments={reelMoments}
              stills={item.debatePosters}
              topSlot={topSlot}
              active={playerActive}
              // Only the cards being watched or about to be hold clip elements: on screen (paused
              // until tapped, outside a feed, so the tap that plays it gives sound), and in a feed
              // the one up next. Further cards show their stills and download nothing.
              mountMedia={!coveredBySheet && (tapToPlay ? onScreen : onScreen || upNext || active)}
              upNext={!tapToPlay && upNext && !active && !coveredBySheet}
              tapToPlay={tapToPlay}
              onPlaybackRequest={tapToPlay ? tapToPlayNow : undefined}
              onShowFullDebate={showFullDebate}
              turns={mediaQuery.data?.turn_segments}
              compact={compactChrome}
            />
          ) : mediaMounted && !reelPending ? (
            // The recordings resolve while the card is still approaching. Crossing back out of
            // that same window unmounts this subtree instead of retaining two paused videos forever.
            <DebateCardVideos
              debate={readyDebate}
              stills={item.debatePosters}
              active={playerActive}
              upNext={!tapToPlay && upNext && !active && !coveredBySheet}
              releaseMedia={releaseMedia}
              reducedOverlays={compactChrome}
              onOpenClaims={openClaims}
              tapToPlay={tapToPlay}
              onPlaybackRequest={tapToPlay ? tapToPlayNow : undefined}
              // With moments, the button back to them; chosen here, the full debate starts at the
              // moment the viewer was on and without the feeds' hold, since they asked for it.
              onShowMoments={reelMoments ? showMoments : undefined}
              initialSeekSeconds={media.fullStartSeconds}
              holdFullPlayback={DEBATE_FEED_HOLDS_FULL_PLAYBACK && !media.fullChosen}
            />
          ) : item.debatePosters ? (
            <DebatePosterSkeleton debateId={debateId} posters={item.debatePosters} topSlot={topSlot} />
          ) : (
            <DebateVideoSkeleton />
          )}
        </div>

        <DebateClaimFooter
          // On `readyDebate`, so the footer outlives the media window (see `mediaMounted`); its reads
          // start the first time the card is in it.
          claim={readyDebate?.claim ?? null}
          enabled={mediaMounted}
          // The way out of the card and into the debate at full size sits at the end of the meta
          // row. The shared metadata keeps fallback cards' space and offer identical; the type tag
          // is left to them, since the card's own shape says what it is.
          meta={
            <DebateExploreMetaRow
              item={item}
              hideSpaceLink={hideSpaceLink}
              hideJoinButton={hideJoinButton}
              hideTypeTag
              compact={compactChrome}
              endSlot={
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  {endSlot}
                  <FullscreenLink
                    requiresFullPage
                    href={NavUtils.toEntity(item.spaceId, item.entityId)}
                    entityId={item.entityId}
                    spaceId={item.spaceId}
                    ariaLabel="Watch this debate full screen"
                  />
                </div>
              }
            />
          }
          // Two lines, as the full-screen title clamps the same claim to, and what this card's
          // height budget is calculated against — a third line is 23px the viewport was not
          // promised.
          title={
            <ExploreCardTitle
              item={item}
              opensSidePanel={titleOpensSidePanel}
              clamped
              showFullTextOnHover={compactChrome}
              debateClaimTitle
            />
          }
          actions={actions}
        />
      </div>

      {/* On `readyDebate`, not on `mediaMounted` like the controls that open these. What the media
          window governs is what a card holds while nobody is looking at it; something already open
          is being looked at. Both of these are fixed overlays over a feed that still scrolls, so
          gating them on the window meant scrolling past the card they came from tore the panel
          away mid-read — and, because the open flags live on the card now rather than in a subtree
          that unmounted with them, left them set, so scrolling back reopened it unasked. */}
      {readyDebate ? (
        <DebateShareDialog
          open={share.open}
          onOpenChange={share.onOpenChange}
          debate={readyDebate}
          spaceId={item.spaceId}
          openerRef={share.openerRef}
        />
      ) : null}
    </ActionSurfaceArticle>
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
  stills,
  active,
  upNext,
  releaseMedia,
  reducedOverlays,
  onOpenClaims,
  tapToPlay,
  onPlaybackRequest,
  onShowMoments,
  initialSeekSeconds,
  holdFullPlayback,
}: {
  debate: Debate;
  stills: ExploreFeedItem['debatePosters'];
  active: boolean;
  upNext: boolean;
  releaseMedia: boolean;
  reducedOverlays: boolean;
  onOpenClaims: () => void;
  tapToPlay: boolean;
  onPlaybackRequest?: () => void;
  /** Draws the Moments / Full debate button; absent for a debate with no moments. */
  onShowMoments?: () => void;
  initialSeekSeconds: number | null;
  holdFullPlayback: boolean;
}) {
  return (
    <DebateFeedPlayer
      debate={debate}
      stills={stills}
      active={active}
      preload
      buffer={upNext}
      releaseMedia={releaseMedia}
      holdFullPlayback={holdFullPlayback}
      initialSeekSeconds={initialSeekSeconds}
      reducedOverlays={reducedOverlays}
      framed
      onOpenClaims={onOpenClaims}
      tapToPlay={tapToPlay}
      onPlaybackRequest={onPlaybackRequest}
      topRight={
        onShowMoments ? (
          <DebateMediaModeToggle
            mode="full"
            onChange={mode => mode === 'moments' && onShowMoments()}
            // Reduced overlays are the gallery tile's, whose button is the compact one.
            compact={reducedOverlays}
          />
        ) : undefined
      }
    />
  );
});

/**
 * The lead debate's stills, painted from the feed response itself (GEO-3280), until the debate and
 * its media resolve and the player takes over with the same two images. Laid out as the player is,
 * one surface with no gap, so the handover does not move anything. A missing still leaves its tile
 * grey, as the player does.
 */
function DebatePosterSkeleton({
  debateId,
  posters,
  topSlot,
}: {
  debateId: string;
  posters: NonNullable<ExploreFeedItem['debatePosters']>;
  /** The slot drawn on top — the Agree speaker's, as the player draws it (GEO-3833). */
  topSlot: 1 | 2;
}) {
  return (
    <div className="flex flex-col overflow-hidden" aria-hidden="true">
      {[posters.slot1, posters.slot2].map((src, index) => (
        <div
          key={index}
          data-debate-poster-slot={index + 1}
          className={cx(
            'relative aspect-480/289 w-full overflow-hidden bg-grey-01',
            topSlot === 2 && (index === 0 ? 'order-2' : 'order-1')
          )}
        >
          {src ? (
            <img
              src={src}
              // The feed may hand over a presigned storage URL; a lapsed one falls back to the durable route.
              onError={fallBackToDurableStill(speakerStillContentUrl(debateId, index === 0 ? 1 : 2))}
              alt=""
              data-debate-poster=""
              draggable={false}
              // The lead card's stills are the page's largest paint, so they go out eagerly and ahead
              // of the other images.
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DebateVideoSkeleton() {
  return (
    <div className="flex flex-col" aria-hidden="true">
      <div className="aspect-480/289 w-full animate-pulse bg-grey-01" />
      <div className="aspect-480/289 w-full animate-pulse bg-grey-01" />
    </div>
  );
}
