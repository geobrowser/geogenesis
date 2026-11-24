import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ capture: vi.fn(), push: vi.fn() }));
vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));
vi.mock('~/core/marketing-events', () => ({ WATCH_DEBATE_MS: 30_000, pushMarketingEvent: mocks.push }));

import { ClipPlaybackAnalytics } from './clip-playback-analytics';
import type { DebateMoment } from './debate-moments';

const DEBATE = 'fd51f935-2063-4617-8039-7b672b23364c';

function moment(id: string, durationMs = 10_000): DebateMoment {
  return {
    id,
    momentIndex: 0,
    claimIndex: 0,
    claimText: null,
    participantSlot: 1,
    clipUrl: `https://chat.example/debates/d/moments/${id}/content`,
    durationMs,
    debateStartMs: 1000,
    debateEndMs: 9000,
    cutStartMs: 750,
    cutEndMs: 9250,
    captions: [],
  };
}

const events = (name: string) =>
  mocks.capture.mock.calls.filter(([event]) => event === name).map(([, props]) => props as Record<string, unknown>);

function analytics() {
  return new ClipPlaybackAnalytics(DEBATE, () => ({
    playback_surface: 'explore',
    component: 'explore_feed_card',
    list_id: 'explore',
    target_id: DEBATE,
    target_type: 'debate',
    item_position: 3,
  }));
}

/** Plays `ms` of clip from `from`, in 500 ms ticks, as the card's clock does. */
function play(a: ClipPlaybackAnalytics, clock: { now: number }, from: number, ms: number, muted = true) {
  for (let t = from; t <= from + ms; t += 500) {
    a.sample({ now: clock.now, mediaMs: t, durationMs: 10_000, eligible: true, muted, inView: true });
    clock.now += 500;
  }
}

beforeEach(() => {
  mocks.capture.mockClear();
  mocks.push.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('ClipPlaybackAnalytics', () => {
  it('measures a clip as the debates app does: clip intervals, one viewing per moment, completed', () => {
    const a = analytics();
    const clock = { now: 1000 };
    a.show(moment('m1'), 0);
    a.setLive(true);
    play(a, clock, 0, 4000);
    a.completed();

    const [interval] = events('debate_playback_interval');
    expect(interval).toMatchObject({
      measurement_version: 'growth-v2',
      debate_id: DEBATE,
      asset_kind: 'clip',
      media_version: 'clip:m1:10000',
      moment_id: 'm1',
      moment_index: 0,
      playback_surface: 'explore',
      component: 'explore_feed_card',
      item_position: 3,
      presentation_instance_id: a.presentationId,
      moments_session_id: a.momentsSessionId,
    });
    expect(interval?.media_start_ms).toBe(0);
    expect(typeof interval?.playback_instance_id).toBe('string');
    expect(interval?.playback_instance_id).not.toBe(a.presentationId);

    const ended = events('debate_moment_ended');
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({
      end_reason: 'completed',
      moment_id: 'm1',
      furthest_ms: 4000,
      moment_duration_ms: 10_000,
      playback_instance_id: interval?.playback_instance_id,
    });
  });

  it('ends a viewing as skipped on a step, left when the card stops being live, switched_to_full on expand', () => {
    const a = analytics();
    const clock = { now: 0 };
    a.show(moment('m1'), 0);
    a.setLive(true);
    play(a, clock, 0, 1000);
    a.show(moment('m2'), 1);
    play(a, clock, 0, 1000);
    a.setLive(false);
    a.setLive(true);
    a.end('switched_to_full');

    expect(events('debate_moment_ended').map(event => [event.moment_id, event.end_reason])).toEqual([
      ['m1', 'skipped'],
      ['m2', 'left'],
      ['m2', 'switched_to_full'],
    ]);
    // A new viewing each time: three distinct playback instances.
    expect(new Set(events('debate_moment_ended').map(event => event.playback_instance_id)).size).toBe(3);
  });

  it('opens no viewing while the card is not live, and reports nothing for it', () => {
    const a = analytics();
    a.show(moment('m1'), 0);
    a.show(moment('m2'), 1);
    a.dispose();
    expect(events('debate_moment_ended')).toEqual([]);
  });

  it('does not reopen a completed moment when the card comes back into view, only on replay', () => {
    const a = analytics();
    a.show(moment('m1'), 0);
    a.setLive(true);
    a.completed();
    a.setLive(false);
    a.setLive(true);
    expect(events('debate_moment_ended')).toHaveLength(1);
    a.replay();
    a.setLive(false);
    expect(events('debate_moment_ended').map(event => event.end_reason)).toEqual(['completed', 'left']);
  });

  it('reports the card exposed once, after a second in view', () => {
    const a = analytics();
    a.show(moment('m1'), 0);
    const tick = (now: number) => a.sample({ now, mediaMs: 0, durationMs: 0, eligible: false, muted: true, inView: true });
    tick(0);
    tick(600);
    expect(events('debate_exposed')).toEqual([]);
    tick(1100);
    tick(5000);
    expect(events('debate_exposed')).toEqual([
      expect.objectContaining({
        debate_id: DEBATE,
        exposure_id: a.presentationId,
        presentation_instance_id: a.presentationId,
        visibility_rule: 'player-60pct-1s-v1',
      }),
    ]);
  });

  it('counts 30 s of unmuted reel toward geo_watch_debate, summed across clips, once (D16)', () => {
    const a = analytics();
    const clock = { now: 0 };
    a.show(moment('m1'), 0);
    a.setLive(true);
    play(a, clock, 0, 12_000, false);
    // Muted time does not count.
    play(a, clock, 0, 12_000, true);
    a.show(moment('m2'), 1);
    play(a, clock, 0, 12_000, false);
    expect(mocks.push).not.toHaveBeenCalled();
    a.show(moment('m3'), 2);
    play(a, clock, 0, 12_000, false);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith('geo_watch_debate', { debate_id: DEBATE });
  });

  it('times the first frame from when playback was wanted, once per viewing', () => {
    const a = analytics();
    a.show(moment('m1'), 0);
    a.setLive(true);
    a.wantPlay(100);
    a.sample({ now: 400, mediaMs: 0, durationMs: 10_000, eligible: true, muted: true, inView: true });
    a.sample({ now: 900, mediaMs: 300, durationMs: 10_000, eligible: true, muted: true, inView: true });
    a.sample({ now: 1400, mediaMs: 800, durationMs: 10_000, eligible: true, muted: true, inView: true });
    expect(events('debate_playback_quality')).toEqual([
      expect.objectContaining({ quality_kind: 'first_frame', time_to_first_frame_ms: 800, moment_id: 'm1' }),
    ]);
  });

  it('records controls on the viewing, and a Play pressed before the viewing opened once it does', () => {
    const a = analytics();
    a.show(moment('m1'), 0);
    a.controlOnOpen('play', 'manual');
    expect(events('debate_playback_control')).toEqual([]);
    a.setLive(true);
    a.control('seek', 'manual', { seek_kind: 'moment_next' });
    const controls = events('debate_playback_control');
    expect(controls.map(event => [event.control, event.trigger, event.seek_kind])).toEqual([
      ['play', 'manual', undefined],
      ['seek', 'manual', 'moment_next'],
    ]);
    expect(controls[0]?.playback_instance_id).toBe(controls[1]?.playback_instance_id);
    expect(controls[0]?.playback_instance_id).not.toBe(a.presentationId);
  });

  it('reports failures and the expand navigation with the registered fields', () => {
    const a = analytics();
    a.show(moment('m1'), 0);
    a.setLive(true);
    a.failed('unknown', 'skipped', 2);
    a.navigation();
    expect(events('debate_playback_quality')[0]).toMatchObject({
      debate_id: DEBATE,
      quality_kind: 'failed',
      failure_action: 'skipped',
      failure_attempt: 2,
    });
    expect(events('debate_playback_quality')[0]?.playback_instance_id).toEqual(expect.any(String));
    expect(events('debate_navigation')[0]).toMatchObject({
      debate_id: DEBATE,
      trigger: 'manual',
      navigation_surface: 'explore_card',
      navigation_id: expect.any(String),
    });
  });
});
