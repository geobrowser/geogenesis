import { describe, expect, it } from 'vitest';

import { FILEBASE_GATEWAY_READ_PATH, LIGHTHOUSE_GATEWAY_READ_PATH, PINATA_GATEWAY_READ_PATH } from '~/core/constants';
import { isOptimizableImageSrc } from '~/core/utils/utils';

import nextConfig from '../../next.config';

describe('isOptimizableImageSrc', () => {
  it('optimizes the three IPFS gateways an ipfs:// value resolves to', () => {
    // These are the hosts `getImagePathAtLevel` produces, so they are the ones that must keep
    // working through the optimizer.
    for (const gateway of [FILEBASE_GATEWAY_READ_PATH, PINATA_GATEWAY_READ_PATH, LIGHTHOUSE_GATEWAY_READ_PATH]) {
      expect(isOptimizableImageSrc(`${gateway}QmExampleCid`)).toBe(true);
    }
  });

  it('optimizes our own origin and same-origin paths', () => {
    expect(isOptimizableImageSrc('/images/placeholder.png')).toBe(true);
    expect(isOptimizableImageSrc('https://www.geobrowser.io/og.png')).toBe(true);
  });

  it('refuses to optimize a host we do not control', () => {
    // The whole point: an entity's image is free text, so this is a URL someone typed. It still
    // renders — the browser fetches it — but our deployment does not fetch it on their behalf.
    expect(isOptimizableImageSrc('https://example.com/whatever.png')).toBe(false);
    expect(isOptimizableImageSrc('https://evil.example/huge.png')).toBe(false);
  });

  it('is not fooled by a lookalike host', () => {
    // Substring matching would pass all three of these; hostname equality does not.
    expect(isOptimizableImageSrc('https://geobrowser.io.evil.example/x.png')).toBe(false);
    expect(isOptimizableImageSrc('https://notgeobrowser.io/x.png')).toBe(false);
    expect(isOptimizableImageSrc('https://evil.example/?x=https://geobrowser.io/')).toBe(false);
  });

  it('declines anything it cannot parse as a URL', () => {
    expect(isOptimizableImageSrc('QmBareCidThatSlippedThrough')).toBe(false);
    expect(isOptimizableImageSrc('')).toBe(false);
  });

  // The failure this guards against is silent: a host the resolver produces but the config does
  // not allow renders as a broken image with no error anywhere, which is precisely why GEO-2984
  // said not to narrow `remotePatterns` blind.
  it('never claims a host the image config would reject', () => {
    const configured = new Set(
      (nextConfig.images?.remotePatterns ?? []).map(pattern =>
        typeof pattern === 'string' ? pattern : (pattern as { hostname: string }).hostname
      )
    );

    for (const gateway of [FILEBASE_GATEWAY_READ_PATH, PINATA_GATEWAY_READ_PATH, LIGHTHOUSE_GATEWAY_READ_PATH]) {
      const { hostname } = new URL(gateway);
      expect(isOptimizableImageSrc(`${gateway}QmExampleCid`)).toBe(true);
      expect(configured, `${hostname} resolves through the optimizer but is not in remotePatterns`).toContain(hostname);
    }
  });
});
