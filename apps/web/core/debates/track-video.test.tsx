import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TrackVideo } from './track-video';

afterEach(cleanup);

describe('TrackVideo', () => {
  it('releases the old track before attaching its replacement to the same video', () => {
    const first = { attach: vi.fn(), detach: vi.fn() };
    const second = { attach: vi.fn(), detach: vi.fn() };
    const { container, rerender, unmount } = render(<TrackVideo track={first} mirrored />);
    const video = container.querySelector('video');
    expect(first.attach).toHaveBeenCalledWith(video);
    expect(video).toHaveClass('-scale-x-100');

    rerender(<TrackVideo track={second} />);
    expect(container.querySelector('video')).toBe(video);
    expect(video).not.toHaveClass('-scale-x-100');
    expect(first.detach).toHaveBeenCalledExactlyOnceWith(video);
    expect(second.attach).toHaveBeenCalledExactlyOnceWith(video);
    expect(first.detach.mock.invocationCallOrder[0]).toBeLessThan(second.attach.mock.invocationCallOrder[0]);

    unmount();
    expect(second.detach).toHaveBeenCalledExactlyOnceWith(video);
  });

  it('attaches a camera that becomes available after the initial render and releases it when removed', () => {
    const track = { attach: vi.fn(), detach: vi.fn() };
    const { container, rerender } = render(<TrackVideo track={null} />);
    expect(container.querySelector('video')).toBeNull();
    rerender(<TrackVideo track={track} />);
    const video = container.querySelector('video');
    expect(track.attach).toHaveBeenCalledExactlyOnceWith(video);
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveProperty('muted', true);
    rerender(<TrackVideo track={null} />);
    expect(container.querySelector('video')).toBeNull();
    expect(track.detach).toHaveBeenCalledExactlyOnceWith(video);
  });
});
