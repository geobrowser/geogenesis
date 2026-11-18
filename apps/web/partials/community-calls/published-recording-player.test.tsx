import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

// Video `v-ipfs` holds its URL under some other property; `call-page` holds only a Geo call page.
const STORE = [
  { spaceId: 's', entity: { id: 'v-ipfs' }, property: { id: 'other' }, value: 'ipfs://from-entity' },
  {
    spaceId: 's',
    entity: { id: 'call-page' },
    property: { id: '412ff593e9154012a43d4c27ec5c68b6' },
    value: 'https://www.geobrowser.io/space/c9f267dcb0d270718c2a3c45a64afd32/calls/0d9c5b2e7a114f3c9e2d8b6a4f1c3e70',
  },
];
vi.mock('~/core/sync/use-store', () => ({
  useValues: ({ selector }: { selector: (v: (typeof STORE)[number]) => boolean }) => STORE.filter(selector),
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

  it('opens on the first playable source and offers only playable ones', () => {
    const { container } = render(
      <PublishedRecordingPlayer
        sources={[
          { directUrl: null, videoEntityId: 'call-page' },
          { directUrl: 'ipfs://a', videoEntityId: 'v' },
          { directUrl: null, videoEntityId: 'v-ipfs' },
        ]}
        spaceId="s"
      />
    );
    expect(video(container)).toHaveAttribute('src', 'ipfs://a');
    expect(screen.queryByRole('button', { name: 'Recording 3' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Recording 2' }));
    expect(video(container)).toHaveAttribute('src', 'ipfs://from-entity');
  });

  it('draws no switcher for a single playable source beside a call page', () => {
    render(
      <PublishedRecordingPlayer
        sources={[
          { directUrl: null, videoEntityId: 'call-page' },
          { directUrl: 'ipfs://a', videoEntityId: 'v' },
        ]}
        spaceId="s"
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
