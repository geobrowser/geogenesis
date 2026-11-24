import { describe, expect, it } from 'vitest';

import { handleFromSocialUrl } from './ontology';

describe('handleFromSocialUrl', () => {
  it.each([
    ['https://x.com/PollTracker2024/status/2121432650305134974', '@PollTracker2024'],
    ['https://twitter.com/jack/status/20', '@jack'],
    ['https://www.twitter.com/jack', '@jack'],
    ['https://mobile.twitter.com/jack/status/20', '@jack'],
    ['https://x.com/jack/status/20?s=20&t=abc', '@jack'],
    ['https://twitter.com/jack/status/20/photo/1', '@jack'],
    ['https://x.com/@jack', '@jack'],
    ['  https://x.com/jack  ', '@jack'],
  ])('reads the account from %s', (url, handle) => {
    expect(handleFromSocialUrl(url)).toBe(handle);
  });

  it.each([
    // App routes, not accounts.
    'https://x.com/i/status/2033096579096432794',
    'https://twitter.com/i/web/status/20',
    'https://x.com/status/20',
    'https://twitter.com/statuses/20',
    'https://x.com/share?text=hello',
    'https://x.com/home',
    'https://x.com/search?q=geo',
    'https://x.com/hashtag/geo',
    'https://x.com/intent/user?screen_name=jack',
    // Not a post or profile host.
    'https://pic.twitter.com/abc123',
    'https://help.x.com/en/rules',
    'https://notx.com/jack',
    'https://x.com.example.org/jack',
    // Not a possible handle.
    'https://x.com/user.name/status/1',
    'https://x.com/averyveryverylonghandle',
    'https://x.com/',
    'https://twitter.com/#!/jack/status/20',
    'x.com/jack/status/20',
    '',
    null,
    undefined,
  ])('returns undefined for %s', url => {
    expect(handleFromSocialUrl(url)).toBeUndefined();
  });
});
