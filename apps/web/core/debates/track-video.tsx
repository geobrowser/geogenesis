'use client';

import * as React from 'react';

import cx from 'classnames';

type VideoTrack = {
  attach: (element: HTMLVideoElement) => void;
  detach: (element: HTMLVideoElement) => void;
};

/** Attach a LiveKit camera to one stable element, mirrored only for the local preview. */
export function TrackVideo({
  track,
  mirrored = false,
  'data-testid': testId,
}: {
  track: VideoTrack | null | undefined;
  mirrored?: boolean;
  'data-testid'?: string;
}) {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const element = ref.current;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  if (!track) return null;
  return (
    <video
      ref={ref}
      data-testid={testId}
      className={cx('size-full object-cover', mirrored && '-scale-x-100')}
      playsInline
      muted
      autoPlay
    />
  );
}
