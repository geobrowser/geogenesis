'use client';

import * as React from 'react';

import { Spinner } from '~/design-system/spinner';

import { type PreparedSocialVideo, type SocialVideoCaptions, usePreparedSocialVideo } from './social-video-share';

const CAPTION_LABELS: Record<SocialVideoCaptions, string> = {
  captioned: 'With captions',
  uncaptioned: 'Without captions',
};

/**
 * The share video in both caption choices (GEO-3442), and which one the person picked.
 *
 * The captioned file is prepared as soon as the surface opens, as it always was, so choosing it
 * hands off at once. The clean file is fetched only after it is chosen: preparing both up front
 * would double the data for everyone who opens the sheet and only copies a link.
 *
 * `handoff` runs straight from the choice's click when the file is ready, inside the person's
 * gesture. When it is not, the choice waits, and `canHandoffWithoutGesture` decides what happens
 * once it is ready: a download can start on its own, but the system share sheet only opens from a
 * tap, so that case leaves the ready row for a second tap instead of failing.
 */
export function useSocialVideoCaptionChoice({
  debateId,
  enabled,
  includePreview,
  uncaptionedAvailable,
  handoff,
  canHandoffWithoutGesture,
}: {
  debateId: string;
  enabled: boolean;
  includePreview: boolean;
  uncaptionedAvailable: boolean;
  handoff: (video: PreparedSocialVideo, captions: SocialVideoCaptions) => void;
  canHandoffWithoutGesture: (video: PreparedSocialVideo) => boolean;
}) {
  const [uncaptionedRequested, setUncaptionedRequested] = React.useState(false);
  const [pending, setPending] = React.useState<SocialVideoCaptions | null>(null);
  const captioned = usePreparedSocialVideo(debateId, { enabled, includePreview });
  const uncaptioned = usePreparedSocialVideo(debateId, {
    enabled: enabled && uncaptionedAvailable && uncaptionedRequested,
    includePreview: false,
    captions: 'uncaptioned',
  });
  const videos: Record<SocialVideoCaptions, PreparedSocialVideo> = { captioned, uncaptioned };

  React.useEffect(() => {
    if (!enabled) {
      setUncaptionedRequested(false);
      setPending(null);
    }
  }, [enabled]);
  React.useEffect(() => {
    setUncaptionedRequested(false);
    setPending(null);
  }, [debateId]);

  const handoffRef = React.useRef(handoff);
  const canHandoffWithoutGestureRef = React.useRef(canHandoffWithoutGesture);
  React.useEffect(() => {
    handoffRef.current = handoff;
    canHandoffWithoutGestureRef.current = canHandoffWithoutGesture;
  }, [handoff, canHandoffWithoutGesture]);

  const pendingVideo = pending ? videos[pending] : null;
  React.useEffect(() => {
    if (!pending || !pendingVideo || pendingVideo.status !== 'ready') return;
    if (!canHandoffWithoutGestureRef.current(pendingVideo)) return;
    setPending(null);
    handoffRef.current(pendingVideo, pending);
  }, [pending, pendingVideo]);

  const choose = (captions: SocialVideoCaptions) => {
    if (captions === 'uncaptioned' && !uncaptionedAvailable) return;
    const video = videos[captions];
    if (captions === 'uncaptioned' && !uncaptionedRequested) {
      setUncaptionedRequested(true);
      setPending(captions);
      return;
    }
    if (video.status === 'ready') {
      setPending(null);
      handoff(video, captions);
      return;
    }
    if (video.status === 'error') video.retry();
    setPending(captions);
  };

  const options: SocialVideoCaptionOption[] = (['captioned', 'uncaptioned'] as const).map(captions => {
    const video = videos[captions];
    const status: SocialVideoCaptionOption['status'] =
      captions === 'uncaptioned' && !uncaptionedAvailable
        ? 'unavailable'
        : pending !== captions
          ? 'idle'
          : video.status === 'ready'
            ? 'awaiting_tap'
            : captions === 'uncaptioned' && !uncaptionedRequested
              ? 'preparing'
              : video.status;
    return { captions, status, progressPercent: video.progressPercent, error: video.error };
  });

  return {
    captioned,
    uncaptioned,
    pending,
    options,
    choose,
    cancel: () => setPending(null),
  };
}

export type SocialVideoCaptionOption = {
  captions: SocialVideoCaptions;
  /**
   * `idle` until chosen. `awaiting_tap` is a chosen file that is ready but needs another tap,
   * because only a tap may open the system share sheet.
   */
  status: 'idle' | 'preparing' | 'ready' | 'error' | 'unavailable' | 'awaiting_tap';
  progressPercent: number | null;
  error: string | null;
};

/** The two caption choices, as rows. `readyAction` names what a second tap does, e.g. "share". */
export function SocialVideoCaptionChoiceRows({
  options,
  onChoose,
  readyAction,
  disabled,
}: {
  options: SocialVideoCaptionOption[];
  onChoose: (captions: SocialVideoCaptions) => void;
  readyAction: string;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label="Captions" className="flex flex-col gap-2">
      {options.map(option => {
        const hint =
          option.status === 'unavailable'
            ? 'Not available for this debate'
            : option.status === 'preparing'
              ? `Preparing…${option.progressPercent !== null ? ` ${option.progressPercent}%` : ''}`
              : option.status === 'error'
                ? `${option.error ?? 'Could not prepare the video.'} Tap to retry.`
                : option.status === 'awaiting_tap'
                  ? `Ready. Tap to ${readyAction}.`
                  : null;
        return (
          <button
            key={option.captions}
            type="button"
            onClick={() => onChoose(option.captions)}
            disabled={disabled || option.status === 'unavailable' || option.status === 'preparing'}
            aria-busy={option.status === 'preparing' || undefined}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-grey-02 px-4 py-2 text-left transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <span className="flex min-w-0 flex-col">
              <span
                className={`text-[15px] leading-5 font-medium ${
                  option.status === 'unavailable' ? 'text-grey-04' : 'text-text'
                }`}
              >
                {CAPTION_LABELS[option.captions]}
              </span>
              {hint && (
                <span
                  aria-live="polite"
                  className={`text-[12px] leading-4 ${option.status === 'error' ? 'text-red-01' : 'text-grey-04'}`}
                >
                  {hint}
                </span>
              )}
            </span>
            {option.status === 'preparing' && <Spinner />}
          </button>
        );
      })}
    </div>
  );
}
