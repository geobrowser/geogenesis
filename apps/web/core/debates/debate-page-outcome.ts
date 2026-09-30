/**
 * What happened to one visit to a debate's page, as a single event (GEO-3074).
 *
 * The playback events (`debate_exposed`, `debate_playback_interval`) only start once a card's
 * videos are ready, so a visit that fails before then leaves no trace at all, and one that fails
 * after it leaves an absence that reads the same whatever the cause. A visit's outcome is either
 * known the moment the linked debate plays, or only when the visitor leaves; this records it once,
 * at whichever comes first, with the stage it had reached.
 */

/** What the feed is still waiting on before it can show the linked debate. */
export type DebatePageLoadStage = 'debate_list' | 'anchor_lookup' | 'media_readiness' | 'ranking';

export type DebatePageFeedState =
  | { kind: 'loading'; stage: DebatePageLoadStage }
  /** The feed fell back to the plain entity page: this debate cannot be watched here. */
  | { kind: 'unavailable'; detail: 'not_found' | 'not_watchable' | 'not_processed' }
  /** A lookup failed, so the feed shows its error state instead of the debate. */
  | { kind: 'lookup_error' }
  /** The linked debate's card is rendered. */
  | { kind: 'shown' };

export type DebatePagePlayerState = {
  ready: boolean;
  playing: boolean;
  autoplayBlocked: boolean;
  error: boolean;
};

export type DebatePageNotPlayedReason =
  | 'loading'
  | 'unavailable'
  | 'lookup_error'
  | 'media_loading'
  | 'autoplay_blocked'
  | 'playback_error'
  | 'not_started'
  | 'scrolled_away';

export type DebatePageLeave = 'hidden' | 'pagehide' | 'unmount';

type Emit = (properties: Record<string, unknown>) => void;

export function createDebatePageOutcome({ debateId, emit, now }: { debateId: string; emit: Emit; now: () => number }) {
  const startedAt = now();
  let feed: DebatePageFeedState = { kind: 'loading', stage: 'debate_list' };
  let player: DebatePagePlayerState | null = null;
  let shownAt: number | null = null;
  let readyAt: number | null = null;
  let movedOn = false;
  let done = false;

  const elapsed = (at: number | null) => (at === null ? null : Math.max(0, Math.round(at - startedAt)));

  const send = (properties: Record<string, unknown>) => {
    done = true;
    try {
      emit({
        // Not `measurement_version`: the collector rejects any event carrying that key unless it is
        // `growth-v2` with a measurement contract, and this event has none, so every one was dropped.
        outcome_version: 'debate-page-v1',
        debate_id: debateId,
        shown_ms: elapsed(shownAt),
        ready_ms: elapsed(readyAt),
        ...properties,
      });
    } catch {
      /* Telemetry cannot interrupt playback. */
    }
  };

  /** Why the visit has not played, from the furthest stage it reached. */
  const reason = (): { reason: DebatePageNotPlayedReason; detail: string | null } => {
    if (movedOn) return { reason: 'scrolled_away', detail: null };
    if (feed.kind === 'loading') return { reason: 'loading', detail: feed.stage };
    if (feed.kind === 'unavailable') return { reason: 'unavailable', detail: feed.detail };
    if (feed.kind === 'lookup_error') return { reason: 'lookup_error', detail: null };
    if (player?.error) return { reason: 'playback_error', detail: null };
    if (!player?.ready) return { reason: 'media_loading', detail: null };
    if (player.autoplayBlocked) return { reason: 'autoplay_blocked', detail: null };
    return { reason: 'not_started', detail: null };
  };

  return {
    feed(next: DebatePageFeedState) {
      if (done) return;
      feed = next;
      if (next.kind === 'shown' && shownAt === null) shownAt = now();
    },
    player(next: DebatePagePlayerState) {
      if (done) return;
      player = next;
      if (next.ready && readyAt === null) readyAt = now();
      if (next.playing)
        send({ outcome: 'played', played_ms: elapsed(now()), left_via: null, reason: null, detail: null });
    },
    /** Another debate became the active one before this one played. */
    movedOn() {
      if (done) return;
      movedOn = true;
    },
    leave(via: DebatePageLeave) {
      if (done) return;
      send({ outcome: 'not_played', played_ms: null, left_via: via, ...reason(), left_ms: elapsed(now()) });
    },
  };
}
