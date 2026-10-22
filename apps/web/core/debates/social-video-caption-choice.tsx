'use client';

import * as React from 'react';

import cx from 'classnames';

import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

import type { DebateMediaResponse } from './api';
import { hasMediaArtifact } from './playback-utils';
import {
  type PreparedSocialVideo,
  SOCIAL_VIDEO_VARIANTS,
  type SocialVideoCaptions,
  usePreparedSocialVideo,
} from './social-video-share';

const CAPTION_LABELS: Record<SocialVideoCaptions, string> = {
  captioned: 'With captions',
  uncaptioned: 'Without captions',
};

/**
 * The share video in both caption choices (GEO-3442), and which one the person picked.
 *
 * The captioned file is prepared as soon as the surface opens, as it always was, so choosing it
 * hands off at once. The clean file is fetched only after it is chosen: preparing both up front
 * would double the data for everyone who opens the sheet and only copies a link. Debates rendered
 * before the clean file existed have no such artifact in `media`, and offer it as unavailable.
 *
 * `handoff` runs straight from the choice's click when the file is ready, inside the person's
 * gesture. When it is not, the choice waits, and `canHandoffWithoutGesture` decides what happens
 * once it is ready: a download can start on its own, but the system share sheet only opens from a
 * tap, so that case leaves the ready row for a second tap instead of failing.
 */
export function useSocialVideoCaptionChoice({
  debateId,
  media,
  enabled,
  includePreview,
  handoff,
  canHandoffWithoutGesture,
}: {
  debateId: string;
  media: DebateMediaResponse | undefined;
  enabled: boolean;
  includePreview: boolean;
  handoff: (video: PreparedSocialVideo, captions: SocialVideoCaptions) => void;
  canHandoffWithoutGesture: (video: PreparedSocialVideo) => boolean;
}) {
  const uncaptionedAvailable = hasMediaArtifact(media, SOCIAL_VIDEO_VARIANTS.uncaptioned.kind);
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

  // Reads the latest file and callbacks without re-running on every render: the prepared videos
  // are new objects each render, and only a status change can make a waiting choice ready.
  const handOffWhenReady = React.useEffectEvent(() => {
    const video = pending ? videos[pending] : null;
    if (!pending || !video || video.status !== 'ready') return;
    if (!canHandoffWithoutGesture(video)) return;
    setPending(null);
    handoff(video, pending);
  });
  const pendingStatus = pending ? videos[pending].status : null;
  React.useEffect(() => {
    handOffWhenReady();
  }, [pending, pendingStatus]);

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
  status: 'idle' | 'preparing' | 'error' | 'unavailable' | 'awaiting_tap';
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
            className={cx(
              'flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-grey-02 px-4 py-2 text-left',
              'transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:hover:bg-transparent'
            )}
          >
            <span className="flex min-w-0 flex-col">
              <Text as="span" variant="metadataMedium" color={option.status === 'unavailable' ? 'grey-04' : 'text'}>
                {CAPTION_LABELS[option.captions]}
              </Text>
              {hint && (
                <span aria-live="polite">
                  <Text as="span" variant="footnote" color={option.status === 'error' ? 'red-01' : 'grey-04'}>
                    {hint}
                  </Text>
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
