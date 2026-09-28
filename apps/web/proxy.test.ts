import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import proxy from './proxy';

/**
 * `proxy.ts` had no tests, which is part of why the cost of its 404 went
 * unnoticed for months: the status line was right, so nothing looked wrong.
 *
 * What these pin is the split — a person still gets the styled page, and
 * everything else gets a response that never reaches the renderer.
 */

const VALID_SPACE = 'c9f267dcb0d270718c2a3c45a64afd32';
const VALID_ENTITY = '3970e24854164ed5a4792d3e418088ef';

function request(
  path: string,
  { method = 'GET', headers = {} }: { method?: string; headers?: Record<string, string> } = {}
) {
  return new NextRequest(new URL(path, 'https://www.geobrowser.io'), { method, headers });
}

/** What a browser sends on a top-level navigation. */
const NAVIGATION = { 'sec-fetch-mode': 'navigate' };

/** A crawler that looks browser-shaped everywhere except the one header that matters. */
const CRAWLER = { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };

describe('real space URLs are left alone', () => {
  it.each([
    `/space/${VALID_SPACE}`,
    `/space/${VALID_SPACE}/governance`,
    `/space/${VALID_SPACE}/${VALID_ENTITY}`,
    `/space/${VALID_SPACE}/opengraph-image`,
    '/space/pending/some-topic-id',
  ])('passes %s through', path => {
    const response = proxy(request(path, { headers: NAVIGATION }));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  // A crawler asking for a real page must still get the real page.
  it('passes a valid URL through for a crawler too', () => {
    const response = proxy(request(`/space/${VALID_SPACE}`, { headers: CRAWLER }));

    expect(response.status).toBe(200);
  });
});

describe('impossible space URLs', () => {
  const IMPOSSIBLE = `/space/BDuZwkjCg3nPWMDshoYtpS/YQZA6HrZQTnUPxjCV8V6M9`;

  // The case the styled page exists for.
  it('rewrites to the styled 404 for a browser navigation', () => {
    const response = proxy(request(IMPOSSIBLE, { headers: NAVIGATION }));

    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-rewrite')).toContain('/_not-found');
  });

  // The 90-plus percent. `x-middleware-rewrite` absent is the assertion that
  // matters: no rewrite means no page render, which is the entire saving.
  it.each([
    ['a crawler sending a browser-shaped Accept', { method: 'GET', headers: CRAWLER }],
    ['a request with no hint headers at all', { method: 'GET', headers: {} }],
    ['a HEAD link check', { method: 'HEAD', headers: {} }],
    ['a HEAD link check that claims to navigate', { method: 'HEAD', headers: NAVIGATION }],
  ])('answers %s without rendering a page', (_label, init) => {
    const response = proxy(request(IMPOSSIBLE, init));

    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  });

  it('gives HEAD no body, and GET a short one', async () => {
    const head = proxy(request(IMPOSSIBLE, { method: 'HEAD' }));
    const get = proxy(request(IMPOSSIBLE, { method: 'GET' }));

    expect(head.body).toBeNull();
    // The styled document this replaces is ~49KB.
    await expect(get.text()).resolves.toBe('Not Found');
  });

  it('lets the edge cache the rejection, since a retired id cannot come back', () => {
    const response = proxy(request(IMPOSSIBLE, { method: 'GET' }));

    expect(response.headers.get('cache-control')).toContain('s-maxage=86400');
  });

  // The formats actually seen in the logs, each a distinct URL and so a distinct
  // render under the old behaviour.
  it.each([
    '/space/0xaa96bf170a91b63b394bc34d4c77796e53dd53e2/95165a4e-a2e1-437f-a81c-c7084ccb4252',
    '/space/SgjATMbm41LX6naizMqBVd/ExL8wDYWcYbTVb3zrGiJ3E',
    '/space/totally-made-up-nonsense-id/also-fake',
    `/space/${VALID_SPACE}/not-a-tab-or-an-id`,
  ])('rejects %s cheaply', path => {
    const response = proxy(request(path, { headers: CRAWLER }));

    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
