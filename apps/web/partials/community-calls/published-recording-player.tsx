'use client';

import * as React from 'react';

import { useVideoWithFallback } from '~/core/hooks/use-video-with-fallback';
import { useVideoUrlFromEntity } from '~/core/utils/use-entity-media';

/** A recording either as a directly-playable URL or an unresolved Video entity id. */
export type RecordingSource = {
  /** Public IPFS/HTTP URL, when already resolved (server-decoded relations). */
  directUrl: string | null;
  /** Video entity to read the IPFS URL off of, when the relation only carries an id. */
  videoEntityId: string | null;
};

/**
 * Playback for a published community-call recording. The active source resolves to a public IPFS
 * URL, which `useVideoWithFallback` streams from the Filebase gateway (walking to Pinata /
 * Lighthouse on error). Unlike the editor-only `RecordingPlayer`, this needs no signed-URL
 * round-trip.
 */
export function PublishedRecordingPlayer({ sources, spaceId }: { sources: RecordingSource[]; spaceId: string }) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  // Clamped: a sync-store update can shrink `sources` out from under a stale index.
  const active = sources[Math.min(activeIndex, sources.length - 1)];

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
        className="aspect-video w-full rounded-lg bg-text"
      />

      {sources.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {sources.map((source, i) => (
            <button
              key={source.directUrl ?? source.videoEntityId ?? i}
              onClick={() => setActiveIndex(i)}
              className={`rounded-md px-2 py-1.5 text-metadata ${
                i === activeIndex ? 'bg-grey-01 text-text' : 'text-grey-04 hover:bg-grey-01'
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
