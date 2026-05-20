'use client';

import * as React from 'react';

import type { InjectPollResponse, SerializedOp } from '~/core/chat/inject-types';

const POLL_INTERVAL_MS = 6_000;
// Real news-story-single runs against the inject worker complete in ~170s
// (smoke-tested 2026-05-19 against NYT). Keep the ceiling well above that so
// transient slowness doesn't trip the fallback.
const HARD_TIMEOUT_MS = 240_000;
// Cap the indeterminate bar so it never hits 100% before the job actually finishes.
export const PROGRESS_CEILING = 95;
// Lower bound so the bar is visible as soon as polling starts.
export const PROGRESS_FLOOR = 5;
// Expected ~170s for news; pace the bar against the typical case so completion
// lands near the ceiling rather than mid-bar.
export const EXPECTED_DURATION_MS = 180_000;

export type InjectJobStatus = 'idle' | 'pending' | 'completed' | 'failed';

// The progress bar (label rotation + bar animation) is driven independently by
// `InjectInlineProgress` off `injectInlineAtom`, so this hook only surfaces the
// terminal result. It deliberately avoids per-poll state updates while pending,
// so a long-running job doesn't re-render the chat tree every 6s.
export type InjectJobState = {
  status: InjectJobStatus;
  name: string | null;
  ops: SerializedOp[] | null;
  error: string | null;
};

const INITIAL_STATE: InjectJobState = {
  status: 'idle',
  name: null,
  ops: null,
  error: null,
};

/**
 * Polls /api/chat/inject/[jobId] until the job is `completed` or `failed`, or
 * the hard timeout (240s) trips. Returns stable `idle` state when `jobId` is
 * null or `enabled` is false. No state updates fire on still-pending polls.
 */
export function useInjectJob(opts: { jobId: string | null; enabled: boolean }): InjectJobState {
  const { jobId, enabled } = opts;
  const [state, setState] = React.useState<InjectJobState>(INITIAL_STATE);

  React.useEffect(() => {
    if (!enabled || !jobId) {
      setState(INITIAL_STATE);
      return;
    }

    let cancelled = false;
    let settled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    const startedAt = Date.now();
    setState({
      status: 'pending',
      name: null,
      ops: null,
      error: null,
    });

    const stopPolling = () => {
      settled = true;
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    const poll = async () => {
      if (cancelled || settled) return;
      const elapsed = Date.now() - startedAt;
      if (elapsed > HARD_TIMEOUT_MS) {
        stopPolling();
        setState(prev => ({ ...prev, status: 'failed', error: 'timeout' }));
        return;
      }

      let res: Response;
      try {
        res = await fetch(`/api/chat/inject/${encodeURIComponent(jobId)}`, {
          method: 'GET',
          credentials: 'same-origin',
        });
      } catch (err) {
        if (cancelled || settled) return;
        console.error('[useInjectJob] fetch failed', err);
        // Transient network errors: keep polling.
        return;
      }

      if (cancelled || settled) return;

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('[useInjectJob] poll non-OK', res.status, text);
        stopPolling();
        setState(prev => ({ ...prev, status: 'failed', error: `Poll failed (${res.status})` }));
        return;
      }

      let body: InjectPollResponse;
      try {
        body = (await res.json()) as InjectPollResponse;
      } catch {
        stopPolling();
        setState(prev => ({ ...prev, status: 'failed', error: 'Poll returned non-JSON' }));
        return;
      }

      if (cancelled || settled) return;

      if (body.status === 'completed') {
        stopPolling();
        setState({ status: 'completed', name: body.name, ops: body.ops, error: null });
        return;
      }
      if (body.status === 'failed') {
        stopPolling();
        setState({ status: 'failed', name: null, ops: null, error: body.error ?? 'Inject job failed.' });
        return;
      }
      // Still pending — no state update; the inline progress UI animates on its
      // own clock, so re-rendering the chat tree every poll buys nothing.
    };

    void poll();
    interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };
  }, [jobId, enabled]);

  return state;
}
