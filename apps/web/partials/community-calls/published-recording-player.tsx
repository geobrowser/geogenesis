'use client';

import * as React from 'react';

import cx from 'classnames';

import type { RecordingSource } from '~/core/community-calls/recordings';
import { useVideoWithFallback } from '~/core/hooks/use-video-with-fallback';
import { useValues } from '~/core/sync/use-store';
import { findMediaUrlValue } from '~/core/utils/media-url';

/**
 * Playback for a published community-call recording. The active source resolves to a public IPFS
 * URL, which `useVideoWithFallback` streams from the Filebase gateway (walking to Pinata /
 * Lighthouse on error). Unlike the editor-only `RecordingPlayer`, this needs no signed-URL
 * round-trip.
 */
export function PublishedRecordingPlayer({
  sources,
  spaceId,
  videoClassName,
  className,
  style,
}: {
  sources: RecordingSource[];
  spaceId: string;
  videoClassName?: string;
  /** On the root, so a player that draws nothing leaves no layout behind. */
  className?: string;
  style?: React.CSSProperties;
}) {
  // A source without a URL on its relation resolves from its Video entity's values; one that
  // resolves to nothing is left out, so no button opens a blank player.
  const entityIds = new Set(sources.flatMap(s => (s.directUrl ? [] : s.videoEntityId ? [s.videoEntityId] : [])));
  const entityValues = useValues({ selector: v => v.spaceId === spaceId && entityIds.has(v.entity.id) });
  const playable = sources.flatMap(source => {
    const url =
      source.directUrl ??
      (source.videoEntityId
        ? findMediaUrlValue(entityValues.filter(v => v.entity.id === source.videoEntityId))
        : undefined);
    return url ? [{ key: source.directUrl ?? source.videoEntityId ?? url, url }] : [];
  });

  const [activeIndex, setActiveIndex] = React.useState(0);
  // Clamped: a sync-store update can shrink the list out from under a stale index. Everything
  // below reads the clamped index, so the playing source and the highlighted button can't diverge.
  const clampedIndex = Math.min(activeIndex, playable.length - 1);
  const activeUrl = playable[clampedIndex]?.url;

  const { src, onError } = useVideoWithFallback(activeUrl);

  if (!activeUrl) return null;

  return (
    <div className={cx('flex w-full min-w-0 flex-col gap-3', className)} style={style}>
      <video
        key={src}
        src={src}
        onError={onError}
        controls
        playsInline
        className={cx('w-full bg-text', videoClassName ?? 'aspect-video rounded-lg')}
      />

      {playable.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {playable.map((source, i) => (
            <button
              key={source.key}
              onClick={() => setActiveIndex(i)}
              className={`rounded-md px-2 py-1.5 text-metadata ${
                i === clampedIndex ? 'bg-grey-01 text-text' : 'text-grey-04 hover:bg-grey-01'
              }`}
            >
              Recording {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
