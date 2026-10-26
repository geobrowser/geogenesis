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
  fit = 'cover',
  'data-testid': testId,
}: {
  track: VideoTrack | null | undefined;
  mirrored?: boolean;
  /** `contain` for a shared screen, which must not be cropped. */
  fit?: 'cover' | 'contain';
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
      className={cx('size-full', fit === 'contain' ? 'object-contain' : 'object-cover', mirrored && '-scale-x-100')}
      playsInline
      muted
      autoPlay
    />
  );
}
