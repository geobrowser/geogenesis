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
  it('does not fall back to an empty key when the header is malformed', () => {
    for (const malformed of ['', '   ', ',', ' , ']) {
      // `''` is a perfectly usable Redis key, so an unguarded `split(',')[0].trim()` buckets every
      // caller sending a malformed header into one limit it never names.
      expect(getClientIp(withHeaders({ 'x-forwarded-for': malformed }))).toBe('noip:shared');
    }
  });

  it('prefers a usable x-real-ip over a malformed x-forwarded-for', () => {
    expect(getClientIp(withHeaders({ 'x-forwarded-for': ' , ', 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  // The bug the eleven chat copies have, which this file had too until review caught it. A fresh
  // UUID per call is not "a bucket per unidentified caller" — it is a bucket per *request*, and a
  // counter that restarts at zero every time never reaches its limit. Anyone able to suppress both
  // headers would have no rate limit at all on a public endpoint that writes into a mailing list.
  it('gives every unidentified request the same bucket, so the limit can actually accumulate', () => {
    const first = getClientIp(withHeaders({}));
    const second = getClientIp(withHeaders({}));

    expect(first).toBe(second);
    expect(first).toBe('noip:shared');
  });
});
