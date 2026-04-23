'use client';

import * as React from 'react';

import { motion } from 'framer-motion';

import { reportError } from '~/core/telemetry/logger';

import { Notice } from '~/design-system/notice';

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

export function AutoRetryError({ error, reset, preview }: Props) {
  const digest = errorDigest(error);

  React.useEffect(() => {
    if (preview) return;
    reportError(error);
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

  return (
    <Notice
      visual={<LargeSpinner />}
      title="Reconnecting"
      description={
        <>
          Something interrupted loading this page.
          <br />
          Retrying automatically...
        </>
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
