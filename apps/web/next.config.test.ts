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
