import { type AnalyticsEventName, capture } from '~/core/analytics';
import { WATCH_DEBATE_MS, pushMarketingEvent } from '~/core/marketing-events';

import { createPlaybackMeasurement } from '../playback-analytics';
import type { DebateMoment } from './debate-moments';

export type MomentEndReason = 'completed' | 'skipped' | 'switched_to_full' | 'left';
export type ClipControl =
  'play' | 'pause' | 'replay' | 'seek' | 'mute' | 'unmute' | 'autoplay_pause' | 'autoplay_resume' | 'start_over';
export type ClipTrigger = 'manual' | 'autoplay';
export type ClipFailureAction = 'retried' | 'skipped' | 'gave_up' | 'refreshed';

/**
 * Where the card is, as the debates app reports its clips (`playback_surface`, `component`), so both
 * apps' clips share one query, with the list the card is in (`list_id`), as the app's profile reel
 * reports `profile_debates`.
 */
export type ClipSurface = {
  /** An Explore card, or a card in the full-screen debate feed (the app's `fullscreen_moment`). */
  playback_surface: 'explore' | 'fullscreen_moment';
  component: 'explore_feed_card' | 'debate_feed_card';
  list_id?: string;
  target_id: string;
  target_type: 'debate';
  item_position?: number;
  /** The feed version and arm behind the card (GEO-3140), as its other actions carry them. */
  feed_version?: string;
  feed_arm?: 'a' | 'b';
  feed_experiment_id?: string;
  feed_exploration?: boolean;
  feed_slot?: 'fresh';
};

type Viewing = {
  moment: DebateMoment;
  index: number;
  instanceId: string;
  furthestMs: number;
  clock: ReturnType<typeof createPlaybackMeasurement>;
  intervals: number;
  /** When playback was first wanted, for the time to the first frame. Null once the frame came. */
  requestedAt: number | null;
  firstFrameSeen: boolean;
};

/**
 * The measurement of an Explore card's moments reel (GEO-3833): the debates app's clip events
 * (debates-react-native `MomentPlayback.ts` / `momentViewing.ts`) on genesis's registered shapes.
 *
 * One instance per card presentation. Within it, one *viewing* per moment watched: it opens when a
 * moment is on screen while the card is live (in view, in the foreground), and closes with one
 * `debate_moment_ended` saying why — the clip played out (`completed`), the viewer stepped or a
 * failed clip was skipped (`skipped`), the card switched to the full debate (`switched_to_full`), or the card
 * stopped being live (`left`). Its playback intervals carry `asset_kind: 'clip'` and the clip's own
 * media times. Pure of React and the DOM, so every path is tested on its own.
 *
 * Unmuted clip time counts toward the `geo_watch_debate` conversion summed across the card's
 * clips, once per presentation, at the same threshold as a full debate (Preston's D16).
 */
export class ClipPlaybackAnalytics {
  readonly presentationId = crypto.randomUUID();
  readonly momentsSessionId = crypto.randomUUID();
  private viewing: Viewing | null = null;
  private moment: { moment: DebateMoment; index: number } | null = null;
  private live = false;
  /** The moment on screen played out; it stays reported until it plays again. */
  private ended = false;
  private exposed = false;
  private visibleSince: number | null = null;
  private watchedMs = 0;
  private lastWatchedTick: number | null = null;
  private watchReported = false;
  /** A Play pressed before the viewing it starts was open (a tap-to-play card): recorded when it opens. */
  private pendingControl: { control: ClipControl; trigger: ClipTrigger } | null = null;
  trigger: ClipTrigger = 'autoplay';

  constructor(
    private readonly debateId: string,
    private readonly surface: () => ClipSurface
  ) {}

  private context(viewing: Viewing | null) {
    const moment = viewing ?? this.moment;
    return {
      measurement_version: 'growth-v2',
      ...this.surface(),
      debate_id: this.debateId,
      asset_kind: 'clip',
      presentation_instance_id: this.presentationId,
      moments_session_id: this.momentsSessionId,
      playback_instance_id: viewing?.instanceId ?? this.presentationId,
      ...(moment
        ? {
            moment_id: moment.moment.id,
            moment_index: moment.index,
            media_version: `clip:${moment.moment.id}:${moment.moment.durationMs ?? 0}`,
          }
        : {}),
    };
  }

  private emit(event: AnalyticsEventName, viewing: Viewing | null, properties: Record<string, unknown>) {
    try {
      capture(event, { ...this.context(viewing), ...properties });
    } catch {
      /* Playback stays usable. */
    }
  }

  /** The moment now on screen. Any viewing of another one closes as `skipped`. */
  show(moment: DebateMoment, index: number, reason: MomentEndReason = 'skipped') {
    if (this.moment?.moment.id === moment.id && this.moment.index === index) return;
    this.end(reason);
    this.moment = { moment, index };
    this.ended = false;
    if (this.live) this.open();
  }

  /** In view and in the foreground. Only real transitions open or close a viewing. */
  setLive(live: boolean) {
    if (this.live === live) return;
    this.live = live;
    if (!live) {
      this.end('left');
      this.visibleSince = null;
      this.lastWatchedTick = null;
    } else if (!this.ended) this.open();
  }

  /** The clip on screen played to its end. */
  completed() {
    this.end('completed');
    this.ended = true;
  }

  /** An ended moment playing again (the reel restarted on it): a new viewing. */
  replay() {
    this.ended = false;
    if (this.live && !this.viewing) this.open();
  }

  private open() {
    if (this.viewing || !this.moment) return;
    this.viewing = {
      ...this.moment,
      instanceId: crypto.randomUUID(),
      furthestMs: 0,
      clock: createPlaybackMeasurement(properties => {
        const viewing = this.viewing;
        if (viewing) this.emit('debate_playback_interval', viewing, properties);
      }),
      intervals: 0,
      requestedAt: null,
      firstFrameSeen: false,
    };
    const pending = this.pendingControl;
    this.pendingControl = null;
    if (pending) this.control(pending.control, pending.trigger);
  }

  end(reason: MomentEndReason) {
    const viewing = this.viewing;
    if (!viewing) return;
    viewing.clock.break();
    this.viewing = null;
    const duration = viewing.moment.durationMs ?? viewing.furthestMs;
    this.emit('debate_moment_ended', viewing, {
      end_reason: reason,
      furthest_ms: Math.round(Math.min(viewing.furthestMs, duration)),
      moment_duration_ms: Math.round(duration),
    });
  }

  /**
   * One tick of the card: called about twice a second while it is mounted, and on the clip's own
   * events. `eligible` is the interval rule (playing, not seeking, enough data, live).
   */
  sample({
    now,
    mediaMs,
    durationMs,
    eligible,
    muted,
    inView,
  }: {
    now: number;
    mediaMs: number;
    durationMs: number;
    eligible: boolean;
    muted: boolean;
    inView: boolean;
  }) {
    // `debate_exposed`: the card held in view for a second, once per presentation.
    if (!inView) this.visibleSince = null;
    else if (this.visibleSince === null) this.visibleSince = now;
    else if (!this.exposed && now - this.visibleSince >= 1000) {
      this.exposed = true;
      this.emit('debate_exposed', null, {
        exposure_id: this.presentationId,
        visibility_rule: 'player-60pct-1s-v1',
      });
    }
    const viewing = this.viewing;
    if (viewing && Number.isFinite(mediaMs)) {
      viewing.furthestMs = Math.max(viewing.furthestMs, mediaMs);
      if (eligible && !viewing.firstFrameSeen && mediaMs > 0) {
        viewing.firstFrameSeen = true;
        if (viewing.requestedAt !== null) {
          this.emit('debate_playback_quality', viewing, {
            quality_kind: 'first_frame',
            time_to_first_frame_ms: Math.max(0, Math.round(now - viewing.requestedAt)),
          });
        }
        viewing.requestedAt = null;
      }
    }
    viewing?.clock.sample({
      now,
      mediaMs: durationMs > 0 ? Math.min(mediaMs, durationMs) : mediaMs,
      durationMs,
      eligible: eligible && viewing !== null,
      muted,
      trigger: this.trigger,
    });
    // Unmuted clip time toward the marketing "watched" event, summed across clips (D16).
    if (!eligible || muted || !viewing) this.lastWatchedTick = null;
    else {
      if (this.lastWatchedTick !== null) this.watchedMs += now - this.lastWatchedTick;
      this.lastWatchedTick = now;
      if (!this.watchReported && this.watchedMs >= WATCH_DEBATE_MS) {
        this.watchReported = true;
        pushMarketingEvent('geo_watch_debate', { debate_id: this.debateId });
      }
    }
  }

  /** Playback was asked for on the open viewing; times its first frame. */
  wantPlay(now: number) {
    const viewing = this.viewing;
    if (viewing && !viewing.firstFrameSeen && viewing.requestedAt === null) viewing.requestedAt = now;
  }

  /** A break in the media clock (pause, wait, seek): the open interval closes. */
  interrupt() {
    this.viewing?.clock.break();
  }

  control(control: ClipControl, trigger: ClipTrigger, properties: Record<string, unknown> = {}) {
    this.viewing?.clock.break();
    if (trigger === 'manual') this.trigger = 'manual';
    this.emit('debate_playback_control', this.viewing, { ...properties, control, trigger });
  }

  /** A control for the viewing about to open (a tap-to-play card's Play, pressed while it was not live). */
  controlOnOpen(control: ClipControl, trigger: ClipTrigger) {
    if (trigger === 'manual') this.trigger = 'manual';
    if (this.viewing) this.control(control, trigger);
    else this.pendingControl = { control, trigger };
  }

  failed(reason: string, action: ClipFailureAction, attempt: number) {
    this.emit('debate_playback_quality', this.viewing, {
      quality_kind: 'failed',
      failure_reason: reason,
      failure_action: action,
      failure_attempt: attempt,
    });
  }

  dispose() {
    this.end('left');
    this.live = false;
  }
}
