import { describe, expect, it } from 'vitest';

import { getClientIp } from './client-ip';

const withHeaders = (headers: Record<string, string>) => new Request('https://geobrowser.io/api', { headers });

describe('getClientIp', () => {
  it('takes the original client from the front of x-forwarded-for, not a proxy behind it', () => {
    expect(getClientIp(withHeaders({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' }))).toBe(
      '203.0.113.7'
    );
  });

  it('trims the surrounding space the header is conventionally written with', () => {
    expect(getClientIp(withHeaders({ 'x-forwarded-for': '  203.0.113.7  ' }))).toBe('203.0.113.7');
  });

  it('falls through to x-real-ip when the forwarded header is absent', () => {
    expect(getClientIp(withHeaders({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  // The drift between the copies this replaces. `''.split(',')[0].trim()` is `''`, which is a
  // perfectly usable Redis key — so the eleven chat copies bucket every caller sending a malformed
  // header into one shared limit, which is a rate-limit bypass for the rest and a denial of service
  // for anyone genuinely behind it.
  it('does not bucket callers together under an empty key when the header is malformed', () => {
    for (const malformed of ['', '   ', ',', ' , ']) {
      const bucket = getClientIp(withHeaders({ 'x-forwarded-for': malformed }));
      expect(bucket).not.toBe('');
      expect(bucket.startsWith('noip:')).toBe(true);
    }
  });

  it('prefers a usable x-real-ip over a malformed x-forwarded-for', () => {
    expect(getClientIp(withHeaders({ 'x-forwarded-for': ' , ', 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  // Off a proxy there is nothing to identify the caller by, and one shared bucket would let a
  // single caller spend everyone else's budget. A key of their own is the safer default.
  it('gives an unidentifiable caller a bucket of their own rather than a shared one', () => {
    const first = getClientIp(withHeaders({}));
    const second = getClientIp(withHeaders({}));

    expect(first.startsWith('noip:')).toBe(true);
    expect(first).not.toBe(second);
  });
});
