'use client';

import * as React from 'react';

import { acquireGestureVideo, releaseGestureVideo } from '~/core/utils/video/gesture-media-pool';

type FeedVideoHandlers = {
  onEmptied?: () => void;
  onEnded?: () => void;
  onError?: () => void;
  onLoadedMetadata?: () => void;
  onPause?: () => void;
  onPlay?: () => void;
  onTimeUpdate?: () => void;
};

export type FeedVideoProps = FeedVideoHandlers & {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  className?: string;
  preload: 'auto' | 'metadata';
  src?: string;
  muted: boolean;
  /**
   * Show the recording in an element from the shared pool instead of a new one (GEO-3594). See
   * `gesture-media-pool.ts`: on iOS a tap unlocks sound element by element, so the next card needs
   * an element a tap has already reached.
   */
  pooled: boolean;
};

/**
 * A debater's `<video>` in the feed player.
 *
 * Unpooled, it is the plain element. Pooled, it borrows an element from the pool, places it where
 * the plain one would be, and keeps the same props on it that React would have written. Either way
 * `videoRef` points at the element by the time the tile's layout effects run, because a child's
 * layout effects run before its parent's.
 */
export function FeedVideo({ pooled, videoRef, className, preload, src, muted, ...handlers }: FeedVideoProps) {
  if (!pooled) {
    return (
      <video
        ref={videoRef}
        className={className}
        playsInline
        preload={preload}
        src={src}
        muted={muted}
        onEmptied={handlers.onEmptied}
        onEnded={handlers.onEnded}
        onError={handlers.onError}
        onLoadedMetadata={handlers.onLoadedMetadata}
        onPause={handlers.onPause}
        onPlay={handlers.onPlay}
        onTimeUpdate={handlers.onTimeUpdate}
      />
    );
  }
  return (
    <PooledVideo
      videoRef={videoRef}
      className={className}
      preload={preload}
      src={src}
      muted={muted}
      handlers={handlers}
    />
  );
}

const EVENTS = [
  ['emptied', 'onEmptied'],
  ['ended', 'onEnded'],
  ['error', 'onError'],
  ['loadedmetadata', 'onLoadedMetadata'],
  ['pause', 'onPause'],
  ['play', 'onPlay'],
  ['timeupdate', 'onTimeUpdate'],
] as const;

function PooledVideo({
  videoRef,
  className,
  preload,
  src,
  muted,
  handlers,
}: Omit<FeedVideoProps, 'pooled' | keyof FeedVideoHandlers> & { handlers: FeedVideoHandlers }) {
  const hostRef = React.useRef<HTMLSpanElement | null>(null);
  const elementRef = React.useRef<HTMLVideoElement | null>(null);
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;

  // Which ref holds the element. Read through a ref so a new ref object moves the element to it, as
  // React does for a plain `ref`, instead of returning the element and borrowing another.
  const heldByRef = React.useRef(videoRef);

  // Borrow on mount, return on unmount. The element goes in during layout, so it is in place and in
  // `videoRef` before the tile's own layout effects attach the source. Declared before the prop
  // effects below, which therefore find it on the same commit.
  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const element = acquireGestureVideo();
    host.appendChild(element);
    elementRef.current = element;
    heldByRef.current.current = element;
    const listeners = EVENTS.map(([type, key]) => {
      const listener = () => handlersRef.current[key]?.();
      element.addEventListener(type, listener);
      return [type, listener] as const;
    });
    return () => {
      for (const [type, listener] of listeners) element.removeEventListener(type, listener);
      if (heldByRef.current.current === element) heldByRef.current.current = null;
      elementRef.current = null;
      releaseGestureVideo(element);
    };
  }, []);

  React.useLayoutEffect(() => {
    const previous = heldByRef.current;
    if (previous === videoRef) return;
    if (previous.current === elementRef.current) previous.current = null;
    videoRef.current = elementRef.current;
    heldByRef.current = videoRef;
  }, [videoRef]);

  // What React writes on a plain `<video>`, written the same way: on mount and when the prop
  // changes, never otherwise. That matters for `preload`, which the tile raises directly on the
  // element and must not be lowered behind its back.
  React.useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    if (className) element.className = className;
    else element.removeAttribute('class');
  }, [className]);
  React.useLayoutEffect(() => {
    if (elementRef.current) elementRef.current.preload = preload;
  }, [preload]);
  React.useLayoutEffect(() => {
    if (elementRef.current) elementRef.current.muted = muted;
  }, [muted]);
  React.useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element || src === undefined) return;
    if (element.getAttribute('src') !== src) element.setAttribute('src', src);
  }, [src]);

  // `display: contents`, so the element lays out as if it were the host's parent's own child.
  return <span ref={hostRef} data-feed-video-host="" style={{ display: 'contents' }} />;
}
