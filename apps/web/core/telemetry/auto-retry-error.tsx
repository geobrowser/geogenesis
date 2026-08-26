'use client';

import * as React from 'react';

import { motion } from 'framer-motion';

import { reportError } from '~/core/telemetry/logger';

import { Notice } from '~/design-system/notice';
import { Text } from '~/design-system/text';

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
  preview?: boolean;
};

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 256_000;
const STORAGE_KEY = 'geo:auto-retry-state';
const STATE_TTL_MS = 30 * 60_000;

type StoredState = {
  digest: string;
  attempts: number;
  timestamp: number;
};

function errorDigest(error: Error & { digest?: string }): string {
  return error.digest ?? `${error.name}:${error.message}`;
}

function readState(digest: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as StoredState;
    if (parsed.digest !== digest) return 0;
    if (Date.now() - parsed.timestamp > STATE_TTL_MS) return 0;
    return parsed.attempts;
  } catch {
    return 0;
  }
}

function writeState(state: StoredState) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/**
 * Whether this looks like a connection problem rather than a fault.
 *
 * `navigator.onLine === false` is the one signal here that means something: the browser is
 * certain there is no network. `true` only means an interface is up, so it is never taken as
 * evidence of connectivity — it just leaves the generic wording in place.
 */
function looksOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function AutoRetryError({ error, reset, preview }: Props) {
  const digest = errorDigest(error);
  const [eventId, setEventId] = React.useState<string | undefined>(undefined);
  // Read once per error rather than during render: the value can change under us, and a
  // render that reads it would disagree with the copy already on screen.
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    if (preview) return;
    setOffline(looksOffline());
    setEventId(reportError(error));
  }, [error, preview]);

  React.useEffect(() => {
    if (preview) return;

    const priorAttempts = readState(digest);
    writeState({ digest, attempts: priorAttempts + 1, timestamp: Date.now() });

    const delay = Math.min(BASE_DELAY_MS * 2 ** priorAttempts, MAX_DELAY_MS);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) reset();
    }, delay);

    const triggerImmediate = () => {
      if (cancelled) return;
      window.clearTimeout(timer);
      cancelled = true;
      reset();
    };

    const handleOnline = () => triggerImmediate();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') triggerImmediate();
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [digest, preview, reset]);

  // "Reconnecting" was shown for *every* error this boundary caught, so a plain bug read to
  // users — and to whoever they reported it to — as a connection problem, and got chased as
  // one (GEO-2670). Claim a connection cause only when the browser says there is no network.
  const reference = eventId ?? (digest === 'preview' ? undefined : digest);

  return (
    <Notice
      visual={<LargeSpinner />}
      title={offline ? 'Reconnecting' : 'Something went wrong'}
      description={
        <>
          {offline ? 'Your device appears to be offline.' : 'This page didn’t load properly.'}
          <br />
          Retrying automatically...
        </>
      }
      // The one thing that makes a screenshot of this actionable. Without it a report is
      // "I saw the reconnecting screen", and the matching Sentry event can't be found.
      footer={
        reference ? (
          <Text as="p" variant="footnote" color="grey-04">
            Reference: <span className="font-mono">{reference.slice(0, 12)}</span>
          </Text>
        ) : null
      }
    />
  );
}

function LargeSpinner() {
  return (
    <motion.svg
      initial={{ rotate: 0 }}
      animate={{ rotate: 360 }}
      transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="20" cy="20" r="17" stroke="#E5E5E5" strokeWidth="3" />
      <path d="M37 20C37 10.6112 29.3888 3 20 3" stroke="#9CA3AF" strokeWidth="3" strokeLinecap="round" />
    </motion.svg>
  );
}
