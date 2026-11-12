'use client';

import * as React from 'react';

import { DebateMomentsPlayer } from '~/core/debates/moments-player/debate-moments-player';
import { useMomentsSpeakers } from '~/core/debates/moments-player/use-moments-speakers';

import { BestDebateWatchContext, useBestDebateRowData } from './best-debate-row';
import { RankingFlowDialog } from './ranking-flow-dialog';

/** Its own group, so a watched debate never pauses (or is paused by) the compare view's players. */
const WATCH_PLAYBACK_GROUP = 'best-debates-watch';

/**
 * Lets every Best debates poster open its debate to watch (Preston, 12 Nov): a dialog with the same
 * Debates-app player the compare view uses, moments first and the full debate a tap away. On a
 * phone the dialog is a full-screen sheet. Escape, the close button and the backdrop close it.
 */
export function BestDebateWatchProvider({ children }: { children: React.ReactNode }) {
  const [watching, setWatching] = React.useState<string | null>(null);
  return (
    <BestDebateWatchContext.Provider value={setWatching}>
      {children}
      {watching ? <WatchDebateDialog entityId={watching} onClose={() => setWatching(null)} /> : null}
    </BestDebateWatchContext.Provider>
  );
}

function WatchDebateDialog({ entityId, onClose }: { entityId: string; onClose: () => void }) {
  const display = useBestDebateRowData(entityId);
  const speakers = useMomentsSpeakers(entityId);
  const title = display?.title ?? 'Debate';
  const meta = [display?.debaters, display?.space?.name].filter(Boolean).join(' · ') || undefined;
  return (
    <RankingFlowDialog open onClose={onClose} title={title} subtitle={meta} size="narrow">
      {/* Held to the height the screen leaves, so the whole picture shows without scrolling. */}
      <div className="mx-auto w-full" style={WATCH_PLAYER_STYLE} data-testid="best-debate-watch">
        <DebateMomentsPlayer
          debateId={entityId}
          label={title}
          playbackGroup={WATCH_PLAYBACK_GROUP}
          speakers={speakers}
        />
      </div>
    </RankingFlowDialog>
  );
}

const WATCH_PLAYER_STYLE: React.CSSProperties = { maxWidth: 'max(240px, calc((100dvh - 300px) * 0.83))' };
