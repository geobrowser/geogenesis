import { beforeEach, describe, expect, it } from 'vitest';

import {
  adAttributionMarketingParams,
  adAttributionProperties,
  captureAdAttribution,
  resetAdAttributionMemory,
} from './ad-attribution';

const now = Date.UTC(2026, 10, 25, 12, 0, 0);

function clearCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

beforeEach(() => {
  window.localStorage.clear();
  resetAdAttributionMemory();
  clearCookies();
});

describe('ad attribution', () => {
  it('stores the fbclid as an _fbc value with the UTMs', () => {
    document.cookie = '_fbp=fb.1.1700000000000.123456789; path=/';
    captureAdAttribution('?fbclid=test123&utm_source=fb&utm_medium=paid&utm_campaign=c1&utm_content=v2', now);

    expect(adAttributionProperties()).toMatchObject({
      first_touch_fbclid: 'test123',
      fbc: `fb.1.${now}.test123`,
      fbp: 'fb.1.1700000000000.123456789',
      first_touch_utm_source: 'fb',
      first_touch_utm_medium: 'paid',
      first_touch_utm_campaign: 'c1',
      first_touch_utm_content: 'v2',
    });
    expect(adAttributionMarketingParams()).toEqual({
      fbc: `fb.1.${now}.test123`,
      fbp: 'fb.1.1700000000000.123456789',
      fbclid: 'test123',
    });
  });

  it('survives a reload (storage) and keeps the first touch', () => {
    captureAdAttribution('?fbclid=first&utm_source=fb', now);
    resetAdAttributionMemory();
    captureAdAttribution('?fbclid=second&utm_source=ig', now + 1000);
    captureAdAttribution('', now + 2000);

    expect(adAttributionProperties()).toMatchObject({ first_touch_fbclid: 'first', first_touch_utm_source: 'fb' });
  });

  it('adds a click id to a stored touch that had none', () => {
    captureAdAttribution('?utm_source=ig', now);
    captureAdAttribution('?fbclid=late', now + 1000);

    expect(adAttributionProperties()).toMatchObject({
      first_touch_fbclid: 'late',
      fbc: `fb.1.${now + 1000}.late`,
      first_touch_utm_source: 'ig',
      first_touch_at: new Date(now).toISOString(),
    });
  });

  it('reuses Meta pixel _fbc cookie for the same click', () => {
    document.cookie = '_fbc=fb.1.1690000000000.abc; path=/';
    captureAdAttribution('?fbclid=abc', now);
    expect(adAttributionMarketingParams().fbc).toBe('fb.1.1690000000000.abc');
  });

  it('records nothing for an organic landing', () => {
    captureAdAttribution('?foo=bar', now);
    expect(adAttributionProperties()).toEqual({});
    expect(window.localStorage.length).toBe(0);
  });

  it('expires after 90 days', () => {
    // read() uses the real clock; a touch captured 91 days before it must be gone.
    captureAdAttribution('?fbclid=old', Date.now() - 91 * 24 * 60 * 60 * 1000);
    expect(adAttributionProperties()).toEqual({});
  });
});
