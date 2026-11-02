import * as React from 'react';

import type { Debate, DebateRecording, RecordingUrlResponse } from '~/core/debates/api';
import { useRecordingPlaybackUrl } from '~/core/debates/hooks';
import {
  DEBATE_STREAM_PLAYBACK_ENABLED,
  previewPairOffsetSeconds,
  recordingHasPreview,
} from '~/core/debates/stream-playback';

import type { DebatePreviewClips } from './feed-full-playback';

/** Re-sign this long before a preview URL's `expires_at`, so an element never holds a dead one. */
export const PREVIEW_URL_REFRESH_LEAD_MS = 60_000;

type Slot = 1 | 2;
type SignedClip = { url: string; expiresAtMs: number | null };
/** Null until signed; `failed` once a slot has no clip to show, so nothing asks again in a loop. */
type SlotClip = SignedClip | 'failed' | null;

export type DebatePreviewClipsState = {
  /** The signed clip per slot, or null: not ready, not signed yet, failed, or the flag is off. */
  clips: DebatePreviewClips;
  /**
   * Whether this debate has a preview for either slot, from the debate alone — known before any
   * URL is signed, so a card does not change how it holds when the signature lands.
   */
  available: boolean;
  /** How far slot 2's clip runs ahead of slot 1's to show the same instant; see `previewPairOffsetSeconds`. */
  offsetSeconds: number;
  /** A clip element failed: sign that slot again, once; after that the slot shows its still. */
  refresh: (slot: Slot) => void;
};

function expiresAtMs(response: RecordingUrlResponse): number | null {
  if (!response.expires_at) return null;
  const parsed = Date.parse(response.expires_at);
  return Number.isNaN(parsed) ? null : parsed;
}

function recordingForSlot(debate: Debate, slot: Slot): DebateRecording | null {
  return debate.recordings?.find(recording => recording.participant_slot === slot) ?? null;
}

/**
 * The preview clips a held feed card loops in place of the stills (Cloudflare Stream).
 *
 * Signed only while `enabled` — the feed passes "near the viewport" (active or preloading) — so a
 * page of cards does not sign a page of clips. Each slot is its own request, and a slot whose clip
 * is not ready, or cannot be signed, is null: the player shows that debater's still beside the
 * other's clip. Re-signed ahead of `expires_at`, and when the element reports the URL dead.
 *
 * With `NEXT_PUBLIC_DEBATE_STREAM_PLAYBACK` off this signs nothing and returns no clips.
 */
export function useDebatePreviewClips(
  debate: Debate,
  enabled: boolean,
  { streamEnabled = DEBATE_STREAM_PLAYBACK_ENABLED }: { streamEnabled?: boolean } = {}
): DebatePreviewClipsState {
  const recordingUrls = useRecordingPlaybackUrl();
  const slot1Recording = recordingForSlot(debate, 1);
  const slot2Recording = recordingForSlot(debate, 2);
  const slot1Filename = recordingHasPreview(slot1Recording, { enabled: streamEnabled })
    ? (slot1Recording?.filename ?? null)
    : null;
  const slot2Filename = recordingHasPreview(slot2Recording, { enabled: streamEnabled })
    ? (slot2Recording?.filename ?? null)
    : null;
  const available = slot1Filename !== null || slot2Filename !== null;

  const offsetSeconds = previewPairOffsetSeconds(slot1Recording, slot2Recording);

  const key = `${debate.id}|${slot1Filename ?? ''}|${slot2Filename ?? ''}`;
  const [signed, setSigned] = React.useState<{ key: string; slot1: SlotClip; slot2: SlotClip }>({
    key,
    slot1: null,
    slot2: null,
  });
  // A different debate (or a clip becoming ready) starts from nothing, in the same render.
  if (signed.key !== key) setSigned({ key, slot1: null, slot2: null });

  const recordingUrlsRef = React.useRef(recordingUrls);
  React.useEffect(() => {
    recordingUrlsRef.current = recordingUrls;
  }, [recordingUrls]);

  const sign = React.useCallback(
    (slot: Slot, fresh: boolean) => {
      const filename = slot === 1 ? slot1Filename : slot2Filename;
      if (!filename) return () => {};
      let cancelled = false;
      const request = { debateId: debate.id, filename, variant: 'preview' as const };
      const signer = fresh ? recordingUrlsRef.current.refresh : recordingUrlsRef.current.lookup;
      signer(request).then(
        response => {
          if (cancelled) return;
          const clip = { url: response.url, expiresAtMs: expiresAtMs(response) };
          setSigned(current =>
            current.key !== key ? current : { ...current, [slot === 1 ? 'slot1' : 'slot2']: clip }
          );
        },
        () => {
          // No clip for this slot: the still stands in. Nothing else to report — the full
          // recording is unaffected.
          if (cancelled) return;
          setSigned(current =>
            current.key !== key ? current : { ...current, [slot === 1 ? 'slot1' : 'slot2']: 'failed' }
          );
        }
      );
      return () => {
        cancelled = true;
      };
    },
    [debate.id, key, slot1Filename, slot2Filename]
  );

  const slot1State = signed.key === key ? signed.slot1 : null;
  const slot2State = signed.key === key ? signed.slot2 : null;
  const slot1Pending = enabled && slot1Filename !== null && slot1State === null;
  const slot2Pending = enabled && slot2Filename !== null && slot2State === null;
  const slot1Signed = slot1State === 'failed' ? null : slot1State;
  const slot2Signed = slot2State === 'failed' ? null : slot2State;

  React.useEffect(() => {
    if (!slot1Pending) return;
    return sign(1, false);
  }, [sign, slot1Pending]);
  React.useEffect(() => {
    if (!slot2Pending) return;
    return sign(2, false);
  }, [sign, slot2Pending]);

  // Re-sign ahead of expiry. Stream preview URLs live for hours, so this matters to a tab left open.
  const slot1Expiry = slot1Signed?.expiresAtMs ?? null;
  const slot2Expiry = slot2Signed?.expiresAtMs ?? null;
  React.useEffect(() => {
    if (!enabled || slot1Expiry === null) return;
    let cancel = () => {};
    const timer = setTimeout(
      () => {
        cancel = sign(1, true);
      },
      Math.max(0, slot1Expiry - PREVIEW_URL_REFRESH_LEAD_MS - Date.now())
    );
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [enabled, sign, slot1Expiry]);
  React.useEffect(() => {
    if (!enabled || slot2Expiry === null) return;
    let cancel = () => {};
    const timer = setTimeout(
      () => {
        cancel = sign(2, true);
      },
      Math.max(0, slot2Expiry - PREVIEW_URL_REFRESH_LEAD_MS - Date.now())
    );
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [enabled, sign, slot2Expiry]);

  // One re-sign per slot when an element reports its clip dead; a second failure leaves the still.
  // Per slot, not per URL: every signature is a new URL, so "once per URL" would never stop.
  const refreshedSlotsRef = React.useRef(new Set<string>());
  const slot1Url = slot1Signed?.url ?? null;
  const slot2Url = slot2Signed?.url ?? null;
  const refresh = React.useCallback(
    (slot: Slot) => {
      const slotKey = `${key}|${slot}`;
      if (refreshedSlotsRef.current.has(slotKey)) {
        setSigned(current =>
          current.key !== key ? current : { ...current, [slot === 1 ? 'slot1' : 'slot2']: 'failed' }
        );
        return;
      }
      refreshedSlotsRef.current.add(slotKey);
      sign(slot, true);
    },
    [key, sign]
  );

  const clips = React.useMemo(() => ({ slot1: slot1Url, slot2: slot2Url }), [slot1Url, slot2Url]);
  return { clips, available, offsetSeconds, refresh };
}

/** How far apart the two clips may drift before slot 2 is moved back into step, in seconds. */
export const PREVIEW_SYNC_TOLERANCE_S = 0.25;

/**
 * Where slot 2's clip should be for slot 1's to show the same instant, wrapped into its loop.
 *
 * Both clips loop, so "ahead by `offsetSeconds`" is modulo the clip's length. The drift is the
 * shorter way round the loop: 3.9s against 0.1s on a 4s clip is 0.2s apart, not 3.8s.
 */
export function previewSyncCorrection(
  slot1Time: number,
  slot2Time: number,
  slot2Duration: number,
  offsetSeconds: number
): number | null {
  if (!Number.isFinite(slot2Duration) || slot2Duration <= 0) return null;
  const target = (((slot1Time + offsetSeconds) % slot2Duration) + slot2Duration) % slot2Duration;
  const apart = Math.abs(slot2Time - target);
  const drift = Math.min(apart, slot2Duration - apart);
  return drift > PREVIEW_SYNC_TOLERANCE_S ? target : null;
}

/**
 * Keeps a card's two preview clips showing the same moment, as the full pair is kept.
 *
 * Slot 1 leads and slot 2 follows it, offset by the gap between the two clips' starts on the
 * debate's clock (`previewPairOffsetSeconds`). Checked on the leader's own ticks, and moved only
 * past a quarter-second, so a pair that is in step is never seeked.
 */
export function usePreviewPairSync(
  slot1Ref: React.RefObject<HTMLVideoElement | null>,
  slot2Ref: React.RefObject<HTMLVideoElement | null>,
  offsetSeconds: number,
  /** The two clips' URLs, or null to leave them alone: a new clip is a new element to listen to. */
  pairKey: string | null
) {
  React.useEffect(() => {
    const leader = slot1Ref.current;
    if (pairKey === null || !leader) return;
    const sync = () => {
      const follower = slot2Ref.current;
      if (!follower || leader.paused || follower.readyState < 1) return;
      const target = previewSyncCorrection(leader.currentTime, follower.currentTime, follower.duration, offsetSeconds);
      if (target !== null) follower.currentTime = target;
    };
    leader.addEventListener('timeupdate', sync);
    leader.addEventListener('playing', sync);
    return () => {
      leader.removeEventListener('timeupdate', sync);
      leader.removeEventListener('playing', sync);
    };
  }, [offsetSeconds, pairKey, slot1Ref, slot2Ref]);
}
