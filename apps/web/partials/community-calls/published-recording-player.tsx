'use client';

import * as React from 'react';

import cx from 'classnames';

import type { RecordingSource } from '~/core/community-calls/recordings';
import { useVideoWithFallback } from '~/core/hooks/use-video-with-fallback';
import { useVideoUrlFromEntity } from '~/core/utils/use-entity-media';

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
}: {
  sources: RecordingSource[];
  spaceId: string;
  videoClassName?: string;
}) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  // Clamped: a sync-store update can shrink `sources` out from under a stale index. Everything
  // below reads the clamped index, so the playing source and the highlighted button can't diverge.
  const clampedIndex = Math.min(activeIndex, sources.length - 1);
  const active = sources[clampedIndex];

  // A no-op for published sources, whose URL already sits on the relation.
  const resolvedFromEntity = useVideoUrlFromEntity(active.videoEntityId ?? undefined, spaceId);
  const activeUrl = active.directUrl ?? resolvedFromEntity;

  const { src, onError } = useVideoWithFallback(activeUrl);

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <video
        key={src}
        src={src}
        onError={onError}
        controls
        playsInline
        className={cx('w-full bg-text', videoClassName ?? 'aspect-video rounded-lg')}
      />

      {sources.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {sources.map((source, i) => (
            <button
              key={source.directUrl ?? source.videoEntityId ?? i}
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
