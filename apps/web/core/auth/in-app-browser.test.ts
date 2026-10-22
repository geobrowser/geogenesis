import { afterEach, describe, expect, it, vi } from 'vitest';

import { isInAppBrowser } from './in-app-browser';

afterEach(() => vi.restoreAllMocks());

describe('isInAppBrowser', () => {
  const withUserAgent = (userAgent: string) =>
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);

  it.each([
    ['Instagram', 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Instagram 320.0.0'],
    ['Facebook', 'Mozilla/5.0 (iPhone) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]'],
    ['LinkedIn', 'Mozilla/5.0 (iPhone) Mobile/15E148 LinkedInApp/9.29'],
  ])('detects %s', (_, userAgent) => {
    withUserAgent(userAgent);
    expect(isInAppBrowser()).toBe(true);
  });

  it('passes a regular browser', () => {
    withUserAgent('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1');
    expect(isInAppBrowser()).toBe(false);
  });
});
