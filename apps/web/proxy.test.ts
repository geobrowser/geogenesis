import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { publishedDebatePath } from '~/core/debates/server/published-debate-path';

import proxy from './proxy';

vi.mock('~/core/debates/server/published-debate-path', () => ({ publishedDebatePath: vi.fn() }));

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
  ])('passes %s through', async path => {
    const response = await proxy(request(path, { headers: NAVIGATION }));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  // A crawler asking for a real page must still get the real page.
  it('passes a valid URL through for a crawler too', async () => {
    const response = await proxy(request(`/space/${VALID_SPACE}`, { headers: CRAWLER }));

    expect(response.status).toBe(200);
  });
});

describe('impossible space URLs', () => {
  const IMPOSSIBLE = `/space/BDuZwkjCg3nPWMDshoYtpS/YQZA6HrZQTnUPxjCV8V6M9`;

  // The case the styled page exists for.
  it('rewrites to the styled 404 for a browser navigation', async () => {
    const response = await proxy(request(IMPOSSIBLE, { headers: NAVIGATION }));

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
  ])('answers %s without rendering a page', async (_label, init) => {
    const response = await proxy(request(IMPOSSIBLE, init));

    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  });

  it('gives HEAD no body, and GET a short one', async () => {
    const head = await proxy(request(IMPOSSIBLE, { method: 'HEAD' }));
    const get = await proxy(request(IMPOSSIBLE, { method: 'GET' }));

    expect(head.body).toBeNull();
    // The styled document this replaces is ~49KB.
    await expect(get.text()).resolves.toBe('Not Found');
  });

  it('lets the edge cache the rejection, since a retired id cannot come back', async () => {
    const response = await proxy(request(IMPOSSIBLE, { method: 'GET' }));

    expect(response.headers.get('cache-control')).toContain('s-maxage=86400');
  });

  // The formats actually seen in the logs, each a distinct URL and so a distinct
  // render under the old behaviour.
  it.each([
    '/space/0xaa96bf170a91b63b394bc34d4c77796e53dd53e2/95165a4e-a2e1-437f-a81c-c7084ccb4252',
    '/space/SgjATMbm41LX6naizMqBVd/ExL8wDYWcYbTVb3zrGiJ3E',
    '/space/totally-made-up-nonsense-id/also-fake',
    `/space/${VALID_SPACE}/not-a-tab-or-an-id`,
  ])('rejects %s cheaply', async path => {
    const response = await proxy(request(path, { headers: CRAWLER }));

    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });
});

// GEO-3435: a recording link opens the debate's own page once the debate is on the graph. It has to
// be a real redirect here: the recording route streams (it has a loading.tsx), so a redirect from
// the page arrives inside a 200 after "Loading the recording…" has painted.
describe('debate recording links', () => {
  const RECORDING = `/space/${VALID_SPACE}/debates/${VALID_ENTITY}/recording`;
  const lookup = vi.mocked(publishedDebatePath);
  afterEach(() => lookup.mockReset());

  it('redirects to the debate page with a 307 once the debate is published', async () => {
    lookup.mockResolvedValue(`/space/${VALID_SPACE}/${VALID_ENTITY}?t=42`);

    const response = await proxy(request(`${RECORDING}?t=42`, { headers: NAVIGATION }));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `https://www.geobrowser.io/space/${VALID_SPACE}/${VALID_ENTITY}?t=42`
    );
    expect(lookup).toHaveBeenCalledWith(VALID_SPACE, VALID_ENTITY, new URLSearchParams('t=42'));
  });

  it('lets the recording page render while the debate is not published', async () => {
    lookup.mockResolvedValue(null);

    const response = await proxy(request(RECORDING, { headers: NAVIGATION }));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  // A crawler-shaped URL with a junk debate id must stay as cheap as the other impossible URLs above,
  // not cost a graph round-trip.
  it('rejects a recording link whose debate id cannot exist, without asking the graph', async () => {
    const browser = await proxy(request(`/space/${VALID_SPACE}/debates/not-an-id/recording`, { headers: NAVIGATION }));
    const crawler = await proxy(request(`/space/${VALID_SPACE}/debates/not-an-id/recording`, { headers: CRAWLER }));

    expect(browser.status).toBe(404);
    expect(browser.headers.get('x-middleware-rewrite')).toContain('/_not-found');
    expect(crawler.status).toBe(404);
    expect(lookup).not.toHaveBeenCalled();
  });

  // The proxy runs on every /space request; the graph client (SDK, viem, app config that throws on a
  // missing env var) must load only when a recording link needs it. See `core/utils/space-url.ts`.
  it('loads the graph lookup only on demand', () => {
    const source = fs.readFileSync(path.join(__dirname, 'proxy.ts'), 'utf8');
    expect(source).not.toMatch(/^import[^;]*published-debate-path/m);
    expect(source).not.toMatch(/^import[^;]*@geoprotocol\/geo-sdk/m);
  });

  it('asks the graph only for recording links', () => {
    for (const path of [`/space/${VALID_SPACE}/${VALID_ENTITY}`, `/space/${VALID_SPACE}/debates/${VALID_ENTITY}`]) {
      proxy(request(path, { headers: NAVIGATION }));
    }
    expect(lookup).not.toHaveBeenCalled();
  });
});
