'use client';

import * as React from 'react';

import { getRecordingUrl } from '~/core/community-calls/api';
import { formatDuration, formatFullDate, formatTimeRange } from '~/core/community-calls/format';
import { Recording } from '~/core/community-calls/types';
import { useCommunityCallIdentityToken } from '~/core/community-calls/use-identity-token';

/** Playback for one or more recordings of a single past occurrence. */
export function RecordingPlayer({ recordings }: { recordings: Recording[] }) {
  const { getToken } = useCommunityCallIdentityToken();
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [url, setUrl] = React.useState<string | null>(null);

  const active = recordings[activeIndex];

  React.useEffect(() => {
    let cancelled = false;
    setUrl(null);

    (async () => {
      const token = await getToken();
      if (!token) return;
      const { url: signedUrl } = await getRecordingUrl({ filename: active.filename }, token);
      if (!cancelled) setUrl(signedUrl);
    })();

    return () => {
      cancelled = true;
    };
  }, [active.filename, getToken]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      {url ? (
        <video key={url} src={url} controls autoPlay className="w-full rounded-lg bg-text" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-text text-metadata text-grey-03">
          Loading recording…
        </div>
      )}

      {recordings.length > 1 && (
        <div className="flex flex-col gap-1">
          {recordings.map((r, i) => (
            <button
              key={r.filename}
              onClick={() => setActiveIndex(i)}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-left text-metadata ${
                i === activeIndex ? 'bg-grey-01 text-text' : 'text-grey-04 hover:bg-grey-01'
              }`}
            >
              <span>
                {formatFullDate(r.startedAt)} · {formatTimeRange(r.startedAt, r.endedAt)}
              </span>
              <span>{formatDuration(r.duration)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
