'use client';

import * as React from 'react';

import Link from 'next/link';

import { useNearViewport } from '~/core/hooks/use-near-viewport';
import { NavUtils } from '~/core/utils/utils';

import { Text } from '~/design-system/text';

import { EXPLORE_CARD_CLASS } from '~/partials/explore/explore-card-chrome';

import { spaceCallPath } from '../routes';
import type { PastCall } from './api';
import { CallRecordingPlayer } from './call-recording-player';

export const PAST_CALL_CARD_COPY = {
  kind: 'Community call',
} as const;

/** "Oct 23, 2026". */
export function pastCallDateLabel(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(ms);
}

/** "1h 31m", "45m"; `null` when unknown. */
export function pastCallDurationLabel(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/**
 * A published past call on Explore (GEO-3421): its space, title, date and the recording. The
 * player mounts once the card nears the viewport and fetches nothing until played.
 */
export function PastCallCard({ call }: { call: PastCall }) {
  const { ref, nearViewport } = useNearViewport();
  const date = pastCallDateLabel(call.ended_at);
  const duration = pastCallDurationLabel(call.recording?.duration_seconds ?? call.duration_seconds);
  const meta = [PAST_CALL_CARD_COPY.kind, date, duration].filter(Boolean).join(' · ');

  return (
    <article ref={ref} className={EXPLORE_CARD_CLASS} data-testid="past-call-card">
      <Text as="p" variant="footnoteMedium" color="grey-04" className="flex flex-wrap items-center gap-1">
        <Link href={NavUtils.toSpace(call.space_id)} className="text-text hover:underline">
          {call.space_name ?? 'Space'}
        </Link>
        <span aria-hidden>·</span>
        <span>{meta}</span>
      </Text>
      <Link href={spaceCallPath(call.space_id, call.call_id)} className="hover:underline">
        <Text as="h2" variant="mediumTitle">
          {call.name}
        </Text>
      </Link>
      <div className="w-full max-w-[773px]">
        {nearViewport ? (
          <CallRecordingPlayer
            callId={call.call_id}
            preload="none"
            poster={call.recording?.thumbnail_url}
            className="aspect-[773/435] rounded-xl"
          />
        ) : (
          <div className="aspect-[773/435] w-full rounded-xl bg-text" />
        )}
      </div>
    </article>
  );
}
