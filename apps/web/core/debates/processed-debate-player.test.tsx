import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProcessedDebatePlayer } from './processed-debate-player';

const mocks = vi.hoisted(() => ({
  mediaMutate: vi.fn(),
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
}));

vi.mock('./hooks', () => ({
  useDebateMediaArtifactUrl: () => ({
    mutate: mocks.mediaMutate,
    isPending: false,
  }),
}));

beforeEach(() => {
  mocks.mediaMutate.mockReset();
  mocks.play.mockClear();
  mocks.pause.mockClear();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: mocks.play,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: mocks.pause,
  });
});

afterEach(cleanup);

describe('ProcessedDebatePlayer', () => {
  it('keeps the player surface transparent around the processed video', () => {
    const { container } = render(
      <ProcessedDebatePlayer
        debateId="debate-1"
        label="Processed debate video"
        previewAvailable={false}
        videoAvailable={false}
      />
    );

    expect(container.firstElementChild).toHaveClass('bg-transparent');
    expect(container.firstElementChild).not.toHaveClass('bg-text');
  });

  it('loads the preview as a poster without requesting the final video', async () => {
    mocks.mediaMutate.mockImplementation((variables, options) => {
      if (variables.request.kind === 'preview_image') {
        options.onSuccess({ upload: { url: 'https://media.test/preview.jpg' } });
      }
    });

    const { container } = render(<ProcessedDebatePlayer debateId="debate-1" label="Processed debate video" />);

    await waitFor(() =>
      expect(container.querySelector('video')).toHaveAttribute('poster', 'https://media.test/preview.jpg')
    );
    expect(mocks.mediaMutate).toHaveBeenCalledWith(
      { debateId: 'debate-1', request: { kind: 'preview_image' } },
      expect.any(Object)
    );
    expect(mocks.mediaMutate.mock.calls.some(([variables]) => variables.request.kind === 'final_video')).toBe(false);
  });

  it('loads and starts the final video in the same player after clicking play', async () => {
    mocks.mediaMutate.mockImplementation((variables, options) => {
      const url =
        variables.request.kind === 'preview_image' ? 'https://media.test/preview.jpg' : 'https://media.test/final.mp4';
      options.onSuccess({ upload: { url } });
    });

    const { container } = render(<ProcessedDebatePlayer debateId="debate-1" label="Processed debate video" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Play Processed debate video' }));

    await waitFor(() =>
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://media.test/final.mp4')
    );
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(container.querySelector('video')).toHaveAttribute('controls');
  });

  it('keeps playback available when an older debate has no preview artifact', async () => {
    mocks.mediaMutate.mockImplementation((variables, options) => {
      if (variables.request.kind === 'final_video') {
        options.onSuccess({ upload: { url: 'https://media.test/final.mp4' } });
      }
    });

    render(<ProcessedDebatePlayer debateId="debate-1" label="Processed debate video" previewAvailable={false} />);

    expect(await screen.findByText('Preview unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play Processed debate video' }));

    await waitFor(() => expect(mocks.play).toHaveBeenCalledTimes(1));
    expect(mocks.mediaMutate.mock.calls.some(([variables]) => variables.request.kind === 'preview_image')).toBe(false);
  });

  it('requests a fresh signed URL after the video source fails', async () => {
    let finalVideoRequest = 0;
    mocks.mediaMutate.mockImplementation((variables, options) => {
      if (variables.request.kind === 'preview_image') {
        options.onSuccess({ upload: { url: 'https://media.test/preview.jpg' } });
        return;
      }
      finalVideoRequest += 1;
      options.onSuccess({ upload: { url: `https://media.test/final-${finalVideoRequest}.mp4` } });
    });

    const { container } = render(<ProcessedDebatePlayer debateId="debate-1" label="Processed debate video" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Play Processed debate video' }));
    const video = container.querySelector('video');
    await waitFor(() => expect(video).toHaveAttribute('src', 'https://media.test/final-1.mp4'));

    fireEvent.error(video!);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry video' }));

    await waitFor(() => expect(video).toHaveAttribute('src', 'https://media.test/final-2.mp4'));
    expect(finalVideoRequest).toBe(2);
  });
});
