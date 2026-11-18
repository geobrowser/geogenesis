import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RecordingSource } from '~/core/community-calls/recordings';

const mocks = vi.hoisted(() => ({ sources: [] as RecordingSource[] }));

vi.mock('~/core/community-calls/use-recording-sources', () => ({ useRecordingSources: () => mocks.sources }));
vi.mock('~/core/sync/use-store', () => ({ useValues: () => [] }));
vi.mock('~/core/hooks/use-video-with-fallback', () => ({
  useVideoWithFallback: (value: string | undefined) => ({ src: value, onError: () => {} }),
}));

const { CommunityCallRecording } = await import('./community-call-recording');

afterEach(cleanup);

describe('CommunityCallRecording', () => {
  it('leaves no layout behind when no source has anything to play', () => {
    mocks.sources = [{ directUrl: null, videoEntityId: 'no-media' }];
    const { container } = render(<CommunityCallRecording entityId="e" spaceId="s" serverRecordingUrls={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lays out a playable recording in the cover slot', () => {
    mocks.sources = [{ directUrl: 'ipfs://a', videoEntityId: 'v' }];
    const { container } = render(<CommunityCallRecording entityId="e" spaceId="s" serverRecordingUrls={[]} />);
    expect(container.firstElementChild).toHaveClass('mx-auto', 'mb-6');
    expect(container.querySelector('video')).toHaveAttribute('src', 'ipfs://a');
  });
});
