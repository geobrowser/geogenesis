import { describe, expect, it, vi } from 'vitest';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';

vi.mock('@sentry/nextjs', () => ({ withSentryConfig: (config: unknown) => config }));
vi.mock('./app/api/environment', () => ({ ServerEnvironment: { sentryBuild: {} } }));

import config from './next.config';

async function marketingRoutes() {
  const rewrites = await config.rewrites!();
  if (Array.isArray(rewrites)) throw new Error('Expected phased rewrites');
  return rewrites.beforeFiles!.filter(route =>
    route.destination.startsWith('https://geo-website-livid.vercel.app')
  );
}

function matches(source: string, path: string) {
  return Boolean(getPathMatch(source)(path));
}

describe('marketing routing', () => {
  it.each(['/', '/terms', '/api/subscribe', '/_marketing/_next/static/chunk.js',
    '/_marketing/image', '/hero/logo.svg', '/hero/debates/debate-1.webm',
    '/curators/card-grey-1.webp', '/opengraph-image.jpg', '/twitter-image.jpg'])
  ('forwards %s to the marketing deployment without changing its path', async path => {
    const routes = await marketingRoutes();
    const route = routes.find(route => matches(route.source, path));
    expect(route).toBeDefined();
    expect(route!.destination).toBe(`https://geo-website-livid.vercel.app${route!.source}`);
  });

  it.each(['/root', '/explore', '/space/123', '/space/123/debates/456',
    '/api/chat', '/api/debates/publish-sweep', '/_next/image', '/_next/static/chunk.js',
    '/early-access', '/curator-program', '/ending-homelessness', '/blog'])
  ('does not capture existing Genesis or legacy route %s', async path => {
    expect((await marketingRoutes()).some(route => matches(route.source, path))).toBe(false);
  });
});

describe('security headers', () => {
  async function headersFor(path: string) {
    const rules = await config.headers!();
    const rule = rules.find(r => matches(r.source, path));
    expect(rule, `no header rule matched ${path}`).toBeDefined();
    return Object.fromEntries(rule!.headers.map(h => [h.key, h.value]));
  }

  it.each(['/root', '/explore', '/space/123/debates/456', '/api/chat', '/'])(
    'sends the security headers on %s',
    async path => {
      const headers = await headersFor(path);
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'none'");
    }
  );

  // Getting this wrong does not fail a build, it breaks debates in the browser. Camera and
  // microphone are LiveKit's; display-capture is community-call screen share.
  it.each(['camera', 'microphone', 'display-capture', 'fullscreen'])('keeps %s available to the app', async feature => {
    const headers = await headersFor('/space/123/debates/456');
    expect(headers['Permissions-Policy']).toContain(`${feature}=(self)`);
  });

  it.each(['geolocation', 'payment', 'usb', 'serial', 'bluetooth', 'midi'])(
    'denies %s, which nothing here uses',
    async feature => {
      const headers = await headersFor('/root');
      expect(headers['Permissions-Policy']).toContain(`${feature}=()`);
    }
  );

  // A deny here would break Privy's embedded wallet, and the failure would look like a bug in
  // their SDK rather than a line in next.config.ts.
  it('says nothing about WebAuthn, leaving it at its default', async () => {
    const headers = await headersFor('/root');
    expect(headers['Permissions-Policy']).not.toContain('publickey-credentials');
  });

  it('is a CSP carrying only frame-ancestors, so it cannot break script or style loading', async () => {
    const headers = await headersFor('/root');
    expect(headers['Content-Security-Policy']).not.toMatch(/script-src|style-src|default-src/);
  });

  it('stops advertising the framework', () => {
    expect(config.poweredByHeader).toBe(false);
  });
});
