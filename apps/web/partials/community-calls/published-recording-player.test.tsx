import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/core/utils/use-entity-media', () => ({
  // Entity `v-ipfs` holds its URL under some other property; anything else resolves to nothing.
  useVideoUrlFromEntity: (id: string | undefined) => (id === 'v-ipfs' ? 'ipfs://from-entity' : undefined),
}));
vi.mock('~/core/hooks/use-video-with-fallback', () => ({
  useVideoWithFallback: (value: string | undefined) => ({ src: value, onError: () => {} }),
}));

const { PublishedRecordingPlayer } = await import('./published-recording-player');

afterEach(cleanup);

const video = (container: HTMLElement) => container.querySelector('video');

describe('PublishedRecordingPlayer', () => {
  it('plays a direct URL, and one resolved from the Video entity', () => {
    const direct = render(
      <PublishedRecordingPlayer sources={[{ directUrl: 'ipfs://a', videoEntityId: 'v' }]} spaceId="s" />
    );
    expect(video(direct.container)).toHaveAttribute('src', 'ipfs://a');
    cleanup();
    const fallback = render(
      <PublishedRecordingPlayer sources={[{ directUrl: null, videoEntityId: 'v-ipfs' }]} spaceId="s" />
    );
    expect(video(fallback.container)).toHaveAttribute('src', 'ipfs://from-entity');
  });

  it('draws nothing for a lone source with nothing to play', () => {
    const { container } = render(
      <PublishedRecordingPlayer sources={[{ directUrl: null, videoEntityId: 'call-page' }]} spaceId="s" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the other recordings reachable when one has nothing to play', () => {
    const { container } = render(
      <PublishedRecordingPlayer
        sources={[
          { directUrl: 'ipfs://a', videoEntityId: 'v' },
          { directUrl: null, videoEntityId: 'call-page' },
        ]}
        spaceId="s"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Recording 2' }));
    expect(video(container)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Recording 1' }));
    expect(video(container)).toHaveAttribute('src', 'ipfs://a');
  });
});
