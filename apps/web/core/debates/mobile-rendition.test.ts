import { describe, expect, it } from 'vitest';

import { isMobilePlaybackDevice, recordingPlaybackVariant } from './mobile-rendition';

const MP4 = 'video/mp4; codecs="avc1.640028, mp4a.40.2"';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

describe('isMobilePlaybackDevice', () => {
  it('counts phones, tablets and iPadOS, whose user agent claims to be a Mac', () => {
    expect(isMobilePlaybackDevice({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(isMobilePlaybackDevice({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(true);
    expect(isMobilePlaybackDevice({ userAgent: MAC_SAFARI, maxTouchPoints: 5 })).toBe(true);
    expect(
      isMobilePlaybackDevice({ userAgent: DESKTOP_CHROME, maxTouchPoints: 0, userAgentData: { mobile: true } })
    ).toBe(true);
  });

  it('leaves desktops alone', () => {
    expect(isMobilePlaybackDevice({ userAgent: MAC_SAFARI, maxTouchPoints: 0 })).toBe(false);
    expect(isMobilePlaybackDevice({ userAgent: DESKTOP_CHROME, maxTouchPoints: 0 })).toBe(false);
    expect(isMobilePlaybackDevice(undefined)).toBe(false);
  });
});

describe('recordingPlaybackVariant', () => {
  const mobile = { enabled: true, isMobile: () => true, canPlay: () => true };

  it('asks for the mobile rendition on a phone when one exists and the flag is on', () => {
    expect(recordingPlaybackVariant({ mobile_content_type: MP4 }, mobile)).toBe('mobile');
  });

  // Everything else is today's request, unchanged.
  it('is off by default', () => {
    expect(recordingPlaybackVariant({ mobile_content_type: MP4 }, { isMobile: () => true, canPlay: () => true })).toBe(
      undefined
    );
  });

  it('asks for the recording itself when there is no rendition yet', () => {
    expect(recordingPlaybackVariant({ mobile_content_type: null }, mobile)).toBe(undefined);
    expect(recordingPlaybackVariant({}, mobile)).toBe(undefined);
    expect(recordingPlaybackVariant(null, mobile)).toBe(undefined);
  });

  it('keeps desktops on the recording', () => {
    expect(recordingPlaybackVariant({ mobile_content_type: MP4 }, { ...mobile, isMobile: () => false })).toBe(
      undefined
    );
  });

  it('keeps a browser that says it cannot play the rendition on the recording', () => {
    const canPlay = (type: string) => {
      expect(type).toBe(MP4);
      return false;
    };
    expect(recordingPlaybackVariant({ mobile_content_type: MP4 }, { ...mobile, canPlay })).toBe(undefined);
  });
});
