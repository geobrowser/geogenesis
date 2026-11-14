'use client';

import * as React from 'react';

import cx from 'classnames';
import { useAtom } from 'jotai';

import { capture } from '~/core/analytics';
import { DEBATES_SPACE_ID } from '~/core/blocks/ranking/best-debates';
import { GeoChatRequestError } from '~/core/debates/api';
import { useDebateTranscript } from '~/core/debates/hooks';
import { useIsMediaAdmin } from '~/core/debates/moments-editor/hooks';
import {
  DebateMomentsPlayer,
  type DebateMomentsPlayerHandle,
  type MomentsPlayerPosition,
} from '~/core/debates/moments-player/debate-moments-player';
import type { PlayerMode } from '~/core/debates/moments-player/story-state';
import { useDebateMoments } from '~/core/debates/moments-player/use-debate-moments';
import { useMomentsSpeakers } from '~/core/debates/moments-player/use-moments-speakers';
import {
  type WatchBlock,
  type WatchLine,
  blockSpeaker,
  fullDebateBlocks,
  highlightedLines,
  momentBlocks,
} from '~/core/debates/moments-player/watch-transcript';
import { useIsPhoneLayout } from '~/core/hooks/use-is-phone-layout';
import { ID } from '~/core/id';

import { BestDebateGradeRow } from './best-debate-grade-row';
import { type BestDebatesGrading, BestDebatesGradingContext } from './best-debate-grading';
import { BestDebateWatchContext, type BestDebateWatchEntry, useBestDebateRowData } from './best-debate-row';
import { EditMomentsMenu, ReelRenderWatcher, captureEditMoments, debateUuid } from './edit-moments';
import { RankingFlowDialog } from './ranking-flow-dialog';
import { type WatchTranscriptContent, WatchTranscriptPanel, type WatchTranscriptView } from './watch-transcript-panel';
import { type BestDebatesWatchSpeed, bestDebatesWatchSpeedAtom, bestDebatesWatchSpeedOf } from '~/atoms';

/** Its own group, so a watched debate never pauses (or is paused by) the compare view's players. */
const WATCH_PLAYBACK_GROUP = 'best-debates-watch';

/** The full transcript's sentences (GEO-3349) where served: whole sentences read better than lines. */
const TRANSCRIPT_INCLUDE = ['sentences'] as const;

type WatchSource = 'best_debates_block' | 'best_debates_ranking';

/**
 * Lets every Best debates poster open its debate to watch (Preston, 12 Nov): a dialog with the same
 * Debates-app player the compare view uses, moments first and the full debate a tap away, beside
 * the debate's transcript and at the speed the ranker last chose (GEO-3728). On a phone the dialog
 * is a full-screen sheet. Escape, the close button and the backdrop close it.
 */
export function BestDebateWatchProvider({
  source,
  blockId,
  spaceId,
  grading = null,
  children,
}: {
  /** The analytics `source` of the watches opened here. */
  source: WatchSource;
  /** The Best debates block and its space, so a watch joins up with that block's placements. */
  blockId: string;
  spaceId: string;
  /** Rankers grade the debate under the player (GEO-3729); null for everyone else. */
  grading?: BestDebatesGrading | null;
  children: React.ReactNode;
}) {
  const [watching, setWatching] = React.useState<string | null>(null);
  // Debates opened in the moments editor this visit (GEO-3742): their new reels are followed even
  // after the popup closes, so the next open plays them.
  const [editing, setEditing] = React.useState<ReadonlySet<string>>(new Set());
  const editMoments = React.useCallback(
    (entityId: string) => {
      captureEditMoments({ source, entity_id: entityId, block_id: blockId, space_id: spaceId });
      setEditing(current => (current.has(entityId) ? current : new Set(current).add(entityId)));
    },
    [source, blockId, spaceId]
  );
  // A watch is the row's main action on the ranking screen (13 Nov), so it's counted: without it a
  // debate watched and not ranked looks the same as one never opened.
  const watch = React.useCallback(
    (entityId: string, entry: BestDebateWatchEntry) => {
      capture('element_clicked', {
        source,
        element_action: 'watch_debate',
        entity_id: entityId,
        entry,
        block_id: blockId,
        space_id: spaceId,
      });
      setWatching(entityId);
    },
    [source, blockId, spaceId]
  );
  return (
    <BestDebateWatchContext.Provider value={watch}>
      {[...editing].map(entityId => (
        <ReelRenderWatcher key={entityId} entityId={entityId} />
      ))}
      {/* The rows' Grade menus grade through the same surface as the popup (GEO-3729). */}
      <BestDebatesGradingContext.Provider value={grading}>{children}</BestDebatesGradingContext.Provider>
      {watching ? (
        <WatchDebateDialog
          entityId={watching}
          analytics={{ source, block_id: blockId, space_id: spaceId }}
          grading={grading}
          onEditMoments={editMoments}
          onClose={() => setWatching(null)}
        />
      ) : null}
    </BestDebateWatchContext.Provider>
  );
}

/**
 * The watch dialog's frame (GEO-3728): the player, with whatever sits under it, on the left and the
 * transcript on the right; on a phone, one column with the player at the top, so the transcript
 * never scrolls it away. `belowPlayer` is the debate's grade (GEO-3729).
 *
 * The player is sized from the screen: the 4:5 picture as large as fits beside its row under it,
 * never wider than 440px. The row sits right under the picture, and the transcript is exactly as
 * tall as the two together (it scrolls when longer), so the dialog has no empty band.
 */
export function WatchDebateLayout({
  player,
  belowPlayer,
  transcript,
}: {
  player: React.ReactNode;
  belowPlayer?: React.ReactNode;
  transcript: React.ReactNode;
}) {
  const style = {
    '--watch-below': belowPlayer ? WATCH_BELOW_PLAYER : '0px',
    // Desktop: the room the dialog leaves (`--watch-room`, its margin taken off; less on a short,
    // wide screen), less its padding and title and the row, never smaller than a usable picture.
    '--watch-w': 'max(180px, min(440px, 42vw, calc((var(--watch-room) - 148px - var(--watch-below)) * 480 / 578)))',
    // Phone: the picture takes at most 42% of the screen's height, so the transcript keeps the rest.
    '--watch-w-phone': 'min(100%, calc(42dvh * 480 / 578))',
  } as React.CSSProperties;
  return (
    <div
      className={cx(
        'flex min-h-0 gap-6 md:h-full md:flex-col md:gap-3',
        '[--watch-room:min(760px,100dvh_-_5rem)] [@media(min-width:768px)_and_(max-height:560px)]:[--watch-room:calc(100dvh_-_2rem)]'
      )}
      style={style}
      data-testid="best-debate-watch-layout"
    >
      <div className="flex [width:var(--watch-w)] shrink-0 flex-col gap-3 md:w-full md:items-center">
        <div className="w-full md:[width:var(--watch-w-phone)]" data-testid="best-debate-watch">
          {player}
        </div>
        {belowPlayer ? <div className="w-full md:[width:var(--watch-w-phone)]">{belowPlayer}</div> : null}
      </div>
      {/* Exactly as tall as the player and its row (the column sets the height; the transcript
          adds none), and it scrolls when longer. On a phone it takes the rest of the screen. */}
      <div className="relative min-w-0 flex-1 md:min-h-[132px]">
        <div className="absolute inset-0 flex flex-col">{transcript}</div>
      </div>
    </div>
  );
}

/** About the grade row's height and the gap above it (GEO-3729), for sizing the picture. */
const WATCH_BELOW_PLAYER = '84px';

const NO_HIGHLIGHT = { moments: null, full: null };

function WatchDebateDialog({
  entityId,
  analytics,
  grading,
  onEditMoments,
  onClose,
}: {
  entityId: string;
  analytics: { source: WatchSource; block_id: string; space_id: string };
  grading: BestDebatesGrading | null;
  onEditMoments: (entityId: string) => void;
  onClose: () => void;
}) {
  const display = useBestDebateRowData(entityId);
  // The "…" with Edit moments (GEO-3742): media admins only (the check fails closed), and desktop
  // only, since the editor has no phone layout (GEO-3744). Nobody else gets the header slot at all.
  const isMediaAdmin = useIsMediaAdmin(debateUuid(entityId), true);
  const isPhone = useIsPhoneLayout();
  const canEditMoments = isMediaAdmin && !isPhone;
  const speakers = useMomentsSpeakers(entityId);
  // The same cached read the player plays, so the Moments transcript is the reel on screen.
  const reel = useDebateMoments(entityId);
  // Read as the popup opens, so switching to the full debate's transcript is instant.
  const transcript = useDebateTranscript(
    entityId.includes('-') ? entityId : ID.hexToUuid(entityId),
    'json',
    true,
    TRANSCRIPT_INCLUDE
  );
  const [storedSpeed, setStoredSpeed] = useAtom(bestDebatesWatchSpeedAtom);
  const speed = bestDebatesWatchSpeedOf(storedSpeed);

  const title = display?.title ?? 'Debate';
  const meta = [display?.debaters, display?.space?.name].filter(Boolean).join(' · ') || undefined;
  const momentsOffered = reel.moments.length > 0;
  const [view, setView] = React.useState<WatchTranscriptView>('moments');
  const shownView: WatchTranscriptView = momentsOffered ? view : 'full';

  const controller = React.useRef<DebateMomentsPlayerHandle | null>(null);
  const reelBlocks = React.useMemo(() => momentBlocks(reel.moments), [reel.moments]);
  const fullBlocks = React.useMemo(() => fullDebateBlocks(transcript.data), [transcript.data]);

  // Only the highlighted lines are kept, not the position: the player reports several times a
  // second, and the dialog re-renders only when the line being spoken changes.
  const [highlight, setHighlight] = React.useState<{ moments: string | null; full: string | null }>(NO_HIGHLIGHT);
  // The moment the player is on (kept while it plays the full debate): the one the Moments view shows.
  const [shownMoment, setShownMoment] = React.useState(0);
  const positionRef = React.useRef<MomentsPlayerPosition | null>(null);
  const onPosition = React.useCallback(
    (position: MomentsPlayerPosition) => {
      positionRef.current = position;
      setShownMoment(position.index);
      const next = highlightedLines(position, reel.moments, reelBlocks, fullBlocks);
      setHighlight(current => (current.moments === next.moments && current.full === next.full ? current : next));
    },
    [reel.moments, reelBlocks, fullBlocks]
  );
  // The full transcript can arrive after the player has started: place the highlight in it then.
  React.useEffect(() => {
    if (positionRef.current) onPosition(positionRef.current);
  }, [onPosition]);

  // The transcript follows the video: switching the player shows that view's transcript. The ranker
  // can still flip the transcript alone, to read ahead.
  const onModeChange = React.useCallback((mode: PlayerMode) => setView(mode), []);

  const event = { ...analytics, entity_id: entityId };
  const changeView = (next: WatchTranscriptView) => {
    if (next === shownView) return;
    capture('element_changed', { ...event, element: 'watch_transcript_view', value: next, previous_value: shownView });
    setView(next);
    // The picture's own switch is off here (GEO-3729), so this one moves the player too: to the full
    // debate where the moment playing sits in it, or back to the moment the full debate is in.
    const at = positionRef.current;
    if (next === 'full') controller.current?.playFullAt(at?.fullMs ?? 0);
    else if (momentsOffered) controller.current?.playMomentAt(Math.min(shownMoment, reel.moments.length - 1), 0);
  };
  const changeSpeed = (next: BestDebatesWatchSpeed) => {
    if (next === speed) return;
    capture('element_changed', { ...event, element: 'watch_playback_speed', value: next, previous_value: speed });
    setStoredSpeed(next);
  };
  const playLine = (block: WatchBlock, line: WatchLine) => {
    capture('element_clicked', {
      ...event,
      element_action: 'watch_transcript_jump',
      view: shownView,
      ...(block.momentIndex !== null ? { moment_index: block.momentIndex } : {}),
    });
    if (block.momentIndex !== null) controller.current?.playMomentAt(block.momentIndex, line.startMs);
    else controller.current?.playFullAt(line.startMs);
  };
  const stepMoment = (index: number) => {
    capture('element_clicked', { ...event, element_action: 'watch_transcript_moment', moment_index: index });
    controller.current?.playMomentAt(index, 0);
  };
  const momentNav =
    shownView === 'moments' && momentsOffered
      ? { index: Math.min(shownMoment, reel.moments.length - 1), count: reel.moments.length, onStep: stepMoment }
      : undefined;

  return (
    <RankingFlowDialog
      open
      onClose={onClose}
      title={title}
      subtitle={meta}
      size="watch"
      headerActions={
        canEditMoments ? (
          <EditMomentsMenu
            entityId={entityId}
            // The editor's path names a space; the route only checks it is one.
            spaceId={display?.space?.id ?? DEBATES_SPACE_ID}
            onOpen={onEditMoments}
          />
        ) : undefined
      }
    >
      <WatchDebateLayout
        player={
          <DebateMomentsPlayer
            debateId={entityId}
            label={title}
            playbackGroup={WATCH_PLAYBACK_GROUP}
            speakers={speakers}
            playbackRate={Number(speed)}
            onPosition={onPosition}
            onModeChange={onModeChange}
            controllerRef={controller}
            // The transcript's Moments / Full debate toggle switches the player too (GEO-3729), so
            // the picture's own pill would be a second switch.
            showModePill={false}
          />
        }
        belowPlayer={
          grading ? (
            <BestDebateGradeRow
              entityId={entityId}
              grading={
                // "Grade it" leaves the popup for "Grade your ranking".
                grading.onGradeYourRanking
                  ? {
                      ...grading,
                      onGradeYourRanking: () => {
                        onClose();
                        grading.onGradeYourRanking?.();
                      },
                    }
                  : grading
              }
            />
          ) : undefined
        }
        transcript={
          <WatchTranscriptPanel
            view={shownView}
            momentsOffered={momentsOffered}
            onViewChange={changeView}
            speed={speed}
            onSpeedChange={changeSpeed}
            content={transcriptContent(
              shownView,
              reel.status,
              reelBlocks,
              momentNav?.index ?? 0,
              transcript,
              fullBlocks
            )}
            highlightKey={shownView === 'moments' ? highlight.moments : highlight.full}
            showTurnTimes={shownView === 'full'}
            speakerOf={slot => blockSpeaker(slot, speakers, reel.slotNames)}
            momentNav={momentNav}
            onLine={playLine}
          />
        }
      />
    </RankingFlowDialog>
  );
}

/** What the transcript shows for the view on screen. */
function transcriptContent(
  view: WatchTranscriptView,
  reelStatus: 'loading' | 'ready' | 'error',
  reelBlocks: readonly WatchBlock[],
  momentIndex: number,
  transcript: Pick<ReturnType<typeof useDebateTranscript>, 'isPending' | 'isError' | 'error' | 'refetch'>,
  fullBlocks: readonly WatchBlock[]
): WatchTranscriptContent {
  if (reelStatus === 'loading') return { status: 'loading' };
  if (view === 'moments') {
    // A reel whose clips carry no captions has nothing to read. Otherwise the moment playing, alone.
    const shown = reelBlocks[momentIndex];
    return shown && reelBlocks.some(block => block.lines.length > 0)
      ? { status: 'ready', blocks: [shown] }
      : { status: 'unavailable' };
  }
  if (transcript.isPending) return { status: 'loading' };
  if (transcript.isError) {
    // A debate with no transcript is a 404: nothing a second try would fix.
    return transcript.error instanceof GeoChatRequestError && transcript.error.status === 404
      ? { status: 'unavailable' }
      : { status: 'error', onRetry: () => void transcript.refetch() };
  }
  return { status: 'ready', blocks: fullBlocks };
}
