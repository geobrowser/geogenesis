import { cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isGestureVideoUnlocked,
  markGestureVideoUnlocked,
  resetGestureVideoPoolForTests,
} from '~/core/utils/video/gesture-media-pool';

import { FeedVideo } from './feed-video';

describe('FeedVideo (GEO-3594)', () => {
  beforeEach(() => {
    resetGestureVideoPoolForTests();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    resetGestureVideoPoolForTests();
    vi.restoreAllMocks();
  });

  function Tile(props: {
    pooled: boolean;
    src?: string;
    muted?: boolean;
    onPlay?: () => void;
    refOut?: (ref: React.RefObject<HTMLVideoElement | null>) => void;
  }) {
    const videoRef = React.useRef<HTMLVideoElement | null>(null);
    props.refOut?.(videoRef);
    return (
      <div data-testid="tile">
        <FeedVideo
          pooled={props.pooled}
          videoRef={videoRef}
          className="relative h-full"
          preload="metadata"
          src={props.src ?? 'https://cdn.test/a.webm'}
          muted={props.muted ?? true}
          onPlay={props.onPlay}
        />
      </div>
    );
  }

  it('renders a pooled element in place, with the props a plain one would have', () => {
    let ref: React.RefObject<HTMLVideoElement | null> | undefined;
    const onPlay = vi.fn();
    const { getByTestId, rerender } = render(<Tile pooled onPlay={onPlay} refOut={r => (ref = r)} />);

    const video = getByTestId('tile').querySelector('video')!;
    expect(ref?.current).toBe(video);
    expect(video.className).toBe('relative h-full');
    expect(video.preload).toBe('metadata');
    expect(video.getAttribute('src')).toBe('https://cdn.test/a.webm');
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);

    video.dispatchEvent(new Event('play'));
    expect(onPlay).toHaveBeenCalledTimes(1);

    rerender(<Tile pooled onPlay={onPlay} muted={false} src="https://cdn.test/b.webm" />);
    expect(video.muted).toBe(false);
    expect(video.getAttribute('src')).toBe('https://cdn.test/b.webm');
  });

  it('gives the element a tap unlocked to the next card', () => {
    const first = render(<Tile pooled />);
    const unlockedVideo = first.getByTestId('tile').querySelector('video')!;
    markGestureVideoUnlocked(unlockedVideo);

    first.unmount();
    const next = render(<Tile pooled />);

    const reused = next.getByTestId('tile').querySelector('video')!;
    expect(reused).toBe(unlockedVideo);
    expect(isGestureVideoUnlocked(reused)).toBe(true);
  });

  it('moves the element to a new ref without giving it up, as React does for `ref`', () => {
    const refs: Array<React.RefObject<HTMLVideoElement | null>> = [];
    function Swapping({ which }: { which: number }) {
      refs[0] ??= React.createRef<HTMLVideoElement>();
      refs[1] ??= React.createRef<HTMLVideoElement>();
      return <FeedVideo pooled videoRef={refs[which]} preload="metadata" src="https://cdn.test/a.webm" muted />;
    }
    const { rerender } = render(<Swapping which={0} />);
    const video = refs[0].current;

    rerender(<Swapping which={1} />);

    expect(refs[1].current).toBe(video);
    expect(refs[0].current).toBeNull();
  });

  it('ends a StrictMode double mount holding one element, with the ref on it', () => {
    let ref: React.RefObject<HTMLVideoElement | null> | undefined;
    const { getByTestId } = render(<Tile pooled refOut={r => (ref = r)} />, { reactStrictMode: true });

    const videos = getByTestId('tile').querySelectorAll('video');
    expect(videos).toHaveLength(1);
    expect(ref?.current).toBe(videos[0]);
  });

  it('renders a plain element when unpooled', () => {
    const { getByTestId } = render(<Tile pooled={false} />);
    expect(getByTestId('tile').querySelector('[data-feed-video-host]')).toBeNull();
    expect(getByTestId('tile').querySelector('video')).not.toBeNull();
  });
});
