import { describe, expect, it } from 'vitest';

import { recordingPlaybackVariant } from './mobile-rendition';

const MP4 = 'video/mp4; codecs="avc1.640028, mp4a.40.2"';
describe('recordingPlaybackVariant', () => {
  const on = { enabled: true, canPlay: () => true };

  it('asks for the feed rendition on any device when one exists and the flag is on', () => {
    expect(recordingPlaybackVariant({ mobile_content_type: MP4 }, on)).toBe('mobile');
  });

  // Everything else is today's request, unchanged.
  it('is off by default', () => {
    expect(recordingPlaybackVariant({ mobile_content_type: MP4 }, { canPlay: () => true })).toBe(undefined);
  });

  it('asks for the recording itself when there is no rendition yet', () => {
    expect(recordingPlaybackVariant({ mobile_content_type: null }, on)).toBe(undefined);
    expect(recordingPlaybackVariant({}, on)).toBe(undefined);
    expect(recordingPlaybackVariant(null, on)).toBe(undefined);
  });

  it('keeps a browser that says it cannot play the rendition on the recording', () => {
    const canPlay = (type: string) => {
      expect(type).toBe(MP4);
      return false;
    };
    expect(recordingPlaybackVariant({ mobile_content_type: MP4 }, { ...on, canPlay })).toBe(undefined);
  });
});
