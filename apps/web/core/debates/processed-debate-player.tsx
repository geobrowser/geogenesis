'use client';

import * as React from 'react';

import cn from 'classnames';

import { VideoSmall } from '~/design-system/icons/video-small';
import { Text } from '~/design-system/text';

import { useDebateMediaArtifactUrl } from './hooks';
import { isExpiredMediaUrl } from './media-url-expiry';

export type ProcessedDebatePlayerHandle = {
  play: () => void;
};

type ProcessedDebatePlayerProps = {
  debateId: string;
  label: string;
  previewAvailable?: boolean;
  videoAvailable?: boolean;
  onActivate?: () => void;
  className?: string;
};

export const ProcessedDebatePlayer = React.forwardRef<ProcessedDebatePlayerHandle, ProcessedDebatePlayerProps>(
  function ProcessedDebatePlayer(
    { debateId, label, previewAvailable = true, videoAvailable = true, onActivate, className },
    ref
  ) {
    const previewArtifact = useDebateMediaArtifactUrl();
    const videoArtifact = useDebateMediaArtifactUrl();
    const videoRef = React.useRef<HTMLVideoElement | null>(null);
    const loadPreviewRef = React.useRef(previewArtifact.mutate);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    const [videoUrl, setVideoUrl] = React.useState<string | null>(null);
    const [previewFailed, setPreviewFailed] = React.useState(false);
    const [playbackError, setPlaybackError] = React.useState<string | null>(null);
    const shouldAutoPlayRef = React.useRef(false);
    const videoRequestGenerationRef = React.useRef(0);
    const refreshingUrlRef = React.useRef(false);
    const pendingPositionRef = React.useRef<number | null>(null);

    React.useEffect(() => {
      loadPreviewRef.current = previewArtifact.mutate;
    }, [previewArtifact.mutate]);

    React.useEffect(() => {
      let active = true;
      setPreviewUrl(null);
      setPreviewFailed(false);
      if (!previewAvailable) return;

      loadPreviewRef.current(
        { debateId, request: { kind: 'preview_image' } },
        {
          onSuccess: response => {
            if (active) setPreviewUrl(response.upload.url);
          },
          onError: () => {
            if (active) setPreviewFailed(true);
          },
        }
      );

      return () => {
        active = false;
      };
    }, [debateId, previewAvailable]);

    React.useEffect(() => {
      videoRef.current?.pause();
      setVideoUrl(null);
      setPlaybackError(null);
      shouldAutoPlayRef.current = false;
      pendingPositionRef.current = null;
      refreshingUrlRef.current = false;
      videoRequestGenerationRef.current++;
      const generation = videoRequestGenerationRef;
      return () => {
        generation.current++;
      };
    }, [debateId]);

    React.useEffect(() => {
      if (!videoUrl || !shouldAutoPlayRef.current || pendingPositionRef.current !== null) return;
      shouldAutoPlayRef.current = false;
      videoRef.current?.play().catch(error => {
        setPlaybackError(error instanceof Error ? error.message : 'Could not play this debate.');
      });
    }, [videoUrl]);

    React.useEffect(
      () => () => {
        videoRef.current?.pause();
      },
      []
    );

    const requestVideo = React.useCallback(
      (resume: boolean, position: number | null = null) => {
        if (refreshingUrlRef.current) return;
        refreshingUrlRef.current = true;
        const generation = ++videoRequestGenerationRef.current;
        shouldAutoPlayRef.current = resume;
        pendingPositionRef.current = position;
        videoArtifact.mutate(
          { debateId, request: { kind: 'final_video' } },
          {
            onSuccess: response => {
              if (videoRequestGenerationRef.current !== generation) return;
              refreshingUrlRef.current = false;
              if (position !== null && isExpiredMediaUrl(response.upload.url)) {
                shouldAutoPlayRef.current = false;
                pendingPositionRef.current = null;
                setVideoUrl(null);
                setPlaybackError('Could not refresh video access.');
                return;
              }
              setVideoUrl(response.upload.url);
            },
            onError: error => {
              if (videoRequestGenerationRef.current !== generation) return;
              refreshingUrlRef.current = false;
              shouldAutoPlayRef.current = false;
              pendingPositionRef.current = null;
              setVideoUrl(null);
              setPlaybackError(error instanceof Error ? error.message : 'Could not load this debate.');
            },
          }
        );
      },
      [debateId, videoArtifact]
    );

    const play = React.useCallback(() => {
      setPlaybackError(null);
      if (!videoAvailable || videoArtifact.isPending) return;
      if (onActivate) {
        onActivate();
        return;
      }
      if (videoUrl && isExpiredMediaUrl(videoUrl)) {
        requestVideo(true, videoRef.current?.currentTime ?? 0);
        return;
      }
      if (videoUrl) {
        videoRef.current?.play().catch(error => {
          setPlaybackError(error instanceof Error ? error.message : 'Could not play this debate.');
        });
        return;
      }

      requestVideo(true);
    }, [onActivate, requestVideo, videoArtifact.isPending, videoAvailable, videoUrl]);

    React.useImperativeHandle(ref, () => ({ play }), [play]);

    const previewMessage = !previewAvailable
      ? 'Preview unavailable'
      : previewFailed
        ? 'Preview unavailable'
        : previewUrl
          ? null
          : 'Loading preview...';

    return (
      <div className={cn('relative aspect-[27/41] overflow-hidden rounded-lg bg-transparent shadow-light', className)}>
        <video
          ref={videoRef}
          src={videoUrl ?? undefined}
          poster={previewUrl ?? undefined}
          controls={Boolean(videoUrl)}
          playsInline
          preload="none"
          aria-label={label}
          onPlay={() => {
            if (isExpiredMediaUrl(videoUrl)) requestVideo(true, videoRef.current?.currentTime ?? 0);
          }}
          onSeeking={() => {
            if (isExpiredMediaUrl(videoUrl)) {
              requestVideo(!videoRef.current?.paused, videoRef.current?.currentTime ?? 0);
            }
          }}
          onPause={() => {
            // A manual pause while renewal is in flight must win over its captured play intent.
            if (refreshingUrlRef.current && !videoRef.current?.error) shouldAutoPlayRef.current = false;
          }}
          onLoadedMetadata={() => {
            const video = videoRef.current;
            if (!video || pendingPositionRef.current === null) return;
            video.currentTime = pendingPositionRef.current;
            pendingPositionRef.current = null;
            if (shouldAutoPlayRef.current) {
              shouldAutoPlayRef.current = false;
              void video.play().catch(() => setPlaybackError('Could not play this debate.'));
            }
          }}
          onError={() => {
            if (refreshingUrlRef.current) return;
            if (isExpiredMediaUrl(videoUrl)) {
              requestVideo(!videoRef.current?.paused, videoRef.current?.currentTime ?? 0);
              return;
            }
            setVideoUrl(null);
            setPlaybackError('Could not play this debate.');
          }}
          className="size-full object-contain"
        />

        {!videoUrl && (
          <button
            type="button"
            aria-label={`Play ${label}`}
            onClick={play}
            disabled={!videoAvailable || videoArtifact.isPending}
            className="group absolute inset-0 grid cursor-pointer place-items-center bg-black/10 transition-colors hover:bg-black/20 disabled:cursor-default"
          >
            <span className="grid size-14 place-items-center rounded-full bg-white text-text shadow-card transition-transform group-hover:scale-105 group-disabled:scale-100">
              <VideoSmall color="text" variant="filled" className="size-5" />
            </span>
            {previewMessage && !videoArtifact.isPending && (
              <Text
                as="span"
                variant="metadata"
                color="white"
                className="absolute inset-x-2 bottom-3 rounded bg-black/55 px-2 py-1 text-center"
              >
                {previewMessage}
              </Text>
            )}
            {videoArtifact.isPending && (
              <Text as="span" variant="metadata" color="white" className="absolute inset-x-2 bottom-3 text-center">
                Loading video...
              </Text>
            )}
          </button>
        )}

        {playbackError && (
          <button
            type="button"
            onClick={play}
            className="absolute inset-x-3 bottom-3 z-10 rounded bg-white px-3 py-2 text-sm font-medium text-text shadow-card"
          >
            Retry video
          </button>
        )}
      </div>
    );
  }
);
