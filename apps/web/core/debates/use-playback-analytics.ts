'use client';

import * as React from 'react';

import { capture } from '~/core/analytics';

import type { Debate } from './api';
import { createPlaybackMeasurement } from './playback-analytics';
import { recordingWindowOffsetsSeconds } from './playback-utils';
import type { DebatePlaybackController } from './use-debate-playback';

export function usePlaybackAnalytics(debate: Debate, active: boolean, controller: DebatePlaybackController) {
  const elementRef = React.useRef<HTMLDivElement>(null);
  const latest = React.useRef({ active, controller });
  latest.current = { active, controller };
  const trigger = React.useRef<'manual' | 'autoplay'>('autoplay');
  const controlRef = React.useRef<(control: string) => void>(() => {});
  const recordings = [1, 2].map(slot => debate.recordings.find(recording => recording.participant_slot === slot));
  // Immutable recording IDs and timing define the media, never signed playback URLs.
  const mediaVersion = JSON.stringify([
    debate.started_at,
    controller.timelineSeconds,
    recordings.map(r => (r ? [r.id, r.started_at_ms, r.ended_at_ms] : null)),
  ]);
  const offset = recordingWindowOffsetsSeconds(
    debate.started_at,
    recordings[0]?.started_at_ms ?? null,
    recordings[1]?.started_at_ms ?? null
  ).slot1;

  React.useEffect(() => {
    const element = elementRef.current;
    const primary = controller.slot1VideoRef.current;
    const secondary = controller.slot2VideoRef.current;
    if (!element || !primary || !secondary || !controller.ready || typeof IntersectionObserver === 'undefined') return;
    const instance = crypto.randomUUID();
    let visible = false;
    let exposed = false;
    let visibleSince: number | null = null;
    let disposed = false;
    let pageHidden = false;
    const context = {
      measurement_version: 'growth-v2',
      debate_id: debate.id,
      media_version: mediaVersion,
      asset_kind: 'full_debate',
      playback_instance_id: instance,
      presentation_instance_id: instance,
    };
    const emit = (event: string, properties: Record<string, unknown>) => {
      try {
        capture(event, { ...context, ...properties });
      } catch {
        /* Playback stays usable. */
      }
    };
    const clock = createPlaybackMeasurement(properties => emit('debate_playback_interval', properties));
    const foreground = () => document.visibilityState === 'visible' && document.hasFocus();
    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const state = latest.current;
      const durationMs = Math.max(0, Math.floor(state.controller.timelineSeconds * 1000));
      const mediaMs = (primary.currentTime + offset) * 1000;
      const inView = !pageHidden && visible && state.active && foreground();
      if (!inView) visibleSince = null;
      else if (visibleSince === null) visibleSince = now;
      else if (!exposed && now - visibleSince >= 1000) {
        exposed = true;
        emit('debate_exposed', { exposure_id: instance, visibility_rule: 'player-60pct-1s-v1' });
      }
      clock.sample({
        now,
        mediaMs: durationMs > 0 ? Math.min(mediaMs, durationMs) : mediaMs,
        durationMs,
        eligible:
          inView &&
          mediaMs >= 0 &&
          !state.controller.isScrubbing &&
          [primary, secondary].every(video => !video.paused && !video.ended && !video.seeking && video.readyState >= 3),
        muted: state.controller.mutedByUser,
        trigger: trigger.current,
      });
    };
    const interrupt = () => {
      clock.break();
    };
    const interruptVisibility = () => {
      interrupt();
      visibleSince = null;
    };
    const hide = () => {
      pageHidden = true;
      interruptVisibility();
    };
    const show = () => {
      pageHidden = false;
      interrupt();
    };
    const observer = new IntersectionObserver(
      entries => {
        visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.6);
        if (!visible) interruptVisibility();
        tick();
      },
      { threshold: [0, 0.6] }
    );
    observer.observe(element);
    const timer = window.setInterval(tick, 500);
    const interruptions = ['waiting', 'pause', 'ended', 'emptied'];
    for (const video of [primary, secondary]) {
      for (const event of interruptions) video.addEventListener(event, interrupt);
    }
    primary.addEventListener('seeking', interrupt);
    primary.addEventListener('ratechange', interrupt);
    document.addEventListener('visibilitychange', interruptVisibility);
    window.addEventListener('blur', interruptVisibility);
    window.addEventListener('geo-analytics-context-changing', interrupt);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    controlRef.current = control => {
      clock.break();
      trigger.current = 'manual';
      emit('debate_playback_control', { control, trigger: 'manual' });
    };
    return () => {
      disposed = true;
      controlRef.current = () => {};
      clock.break();
      window.clearInterval(timer);
      observer.disconnect();
      for (const video of [primary, secondary]) {
        for (const event of interruptions) video.removeEventListener(event, interrupt);
      }
      primary.removeEventListener('seeking', interrupt);
      primary.removeEventListener('ratechange', interrupt);
      document.removeEventListener('visibilitychange', interruptVisibility);
      window.removeEventListener('blur', interruptVisibility);
      window.removeEventListener('geo-analytics-context-changing', interrupt);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [debate.id, mediaVersion, offset, controller.ready, controller.slot1VideoRef, controller.slot2VideoRef]);

  return { elementRef, control: (name: string) => controlRef.current(name) };
}
