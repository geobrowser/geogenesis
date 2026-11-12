import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { debatesAppRedirect, debatesAppRedirectEnabled } from '~/core/debates/server/debates-app-redirect';
import { publishedDebatePath } from '~/core/debates/server/published-debate-path';
import { createShareLink } from '~/core/sharing/share-link';

import proxy, { config } from './proxy';

vi.mock('~/core/debates/server/published-debate-path', () => ({ publishedDebatePath: vi.fn() }));
vi.mock('~/core/debates/server/debates-app-redirect', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/debates/server/debates-app-redirect')>()),
  debatesAppRedirect: vi.fn(),
  debatesAppRedirectEnabled: vi.fn(() => true),
}));

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

    const response = await proxy(
      request(`${RECORDING}?t=42`, { headers: { ...NAVIGATION, 'sec-fetch-site': 'same-origin' } })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `https://www.geobrowser.io/space/${VALID_SPACE}/${VALID_ENTITY}?t=42`
    );
    expect(lookup).toHaveBeenCalledWith(VALID_SPACE, VALID_ENTITY, new URLSearchParams('t=42'));
  });

  // Review of #2951: the lookup is loaded on demand, and its module can throw on load (app config
  // checks env vars). That must fall back to the recording page, not fail the request.
  it('lets the recording page render when the lookup itself fails', async () => {
    lookup.mockRejectedValue(new Error('NEXT_PUBLIC_PRIVY_APP_ID is not set'));

    const response = await proxy(request(RECORDING, { headers: NAVIGATION }));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
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

describe('short share links (GEO-3485)', () => {
  const SHARE_ID = '22222222222242228222222222222222';
  /** The path and query of the link a share control copies. */
  const shared = (...args: Parameters<typeof createShareLink>) => {
    const url = new URL(createShareLink(...args).url);
    return url.pathname + url.search;
  };

  it('redirects a short debate link to the tagged landing the warehouse reads', async () => {
    const response = await proxy(
      request(
        shared(`https://www.geobrowser.io/space/${VALID_SPACE}/${VALID_ENTITY}`, 'debate', VALID_ENTITY, 'x', SHARE_ID),
        { headers: NAVIGATION }
      )
    );

    expect(response.status).toBe(307);
    const landing = new URL(response.headers.get('location')!);
    expect(landing.pathname).toBe(`/space/${VALID_SPACE}/${VALID_ENTITY}`);
    expect(landing.searchParams.has('si')).toBe(false);
    expect(landing.searchParams.get('utm_source')).toBe('x');
    expect(landing.searchParams.get('utm_content')).toBe(`v1:debate:${VALID_ENTITY}:${SHARE_ID}`);
  });

  it('redirects a short lobby link, keeping its other parameters', async () => {
    const response = await proxy(
      request(
        shared(
          `https://www.geobrowser.io/debate/${VALID_ENTITY}?via=lobby`,
          'lobby',
          VALID_ENTITY,
          'copy_link',
          SHARE_ID
        )
      )
    );

    expect(response.status).toBe(307);
    const landing = new URL(response.headers.get('location')!);
    expect(landing.pathname).toBe(`/debate/${VALID_ENTITY}`);
    expect(landing.searchParams.get('via')).toBe('lobby');
    expect(landing.searchParams.get('utm_source')).toBe('copy_link');
  });

  it('opens a room as it is when its code does not parse', async () => {
    const response = await proxy(request(`/debate/${VALID_ENTITY}?si=nonsense`));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('only routes /debate through the proxy when it carries a short code', () => {
    expect(config.matcher).toContainEqual({ source: '/debate/:path*', has: [{ type: 'query', key: 'si' }] });
  });
});

describe('old debate URLs open the debates app (GEO-3695)', () => {
  const PAGE = `/space/${VALID_SPACE}/${VALID_ENTITY}`;
  const redirect = vi.mocked(debatesAppRedirect);
  const enabled = vi.mocked(debatesAppRedirectEnabled);
  const FROM_OUTSIDE = { ...NAVIGATION, 'sec-fetch-site': 'cross-site' };
  afterEach(() => {
    redirect.mockReset();
    enabled.mockReset().mockReturnValue(true);
  });

  it('sends a person arriving from outside to the debates app with a 307, query and all', async () => {
    redirect.mockResolvedValue(`https://debates.geobrowser.io/debate/${VALID_ENTITY}?utm_source=x`);

    const response = await proxy(request(`${PAGE}?utm_source=x`, { headers: FROM_OUTSIDE }));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`https://debates.geobrowser.io/debate/${VALID_ENTITY}?utm_source=x`);
    expect(redirect).toHaveBeenCalledWith(VALID_SPACE, VALID_ENTITY, new URLSearchParams('utm_source=x'));
  });

  it('counts a typed URL or bookmark (no site) as arriving from outside', async () => {
    redirect.mockResolvedValue(`https://debates.geobrowser.io/debate/${VALID_ENTITY}`);
    const response = await proxy(request(PAGE, { headers: { ...NAVIGATION, 'sec-fetch-site': 'none' } }));
    expect(response.status).toBe(307);
  });

  it('leaves clicks inside geobrowser.io, crawlers and link previews on the page, without a lookup', async () => {
    const inside = await proxy(request(PAGE, { headers: { ...NAVIGATION, 'sec-fetch-site': 'same-origin' } }));
    const crawler = await proxy(request(PAGE, { headers: CRAWLER }));
    expect(inside.status).toBe(200);
    expect(crawler.status).toBe(200);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('renders the page as before when the entity is not a debate or the lookup fails', async () => {
    redirect.mockResolvedValueOnce(null);
    expect((await proxy(request(PAGE, { headers: FROM_OUTSIDE }))).headers.get('location')).toBeNull();
    redirect.mockRejectedValueOnce(new Error('graph down'));
    expect((await proxy(request(PAGE, { headers: FROM_OUTSIDE }))).headers.get('location')).toBeNull();
  });

  // Review of #3110: a recording link from outside (the "Your debate is ready" email) would hop to
  // the debate page and then to the debates app; it goes there at once, on the lookup it made.
  it('sends a published recording link from outside straight to the debates app', async () => {
    const lookup = vi.mocked(publishedDebatePath);
    lookup.mockResolvedValue(`/space/${VALID_SPACE}/${VALID_ENTITY}?t=42`);
    const recording = `/space/${VALID_SPACE}/debates/${VALID_ENTITY}/recording?t=42`;

    const response = await proxy(request(recording, { headers: FROM_OUTSIDE }));
    const stay = await proxy(request(`${recording}&stay=1`, { headers: FROM_OUTSIDE }));
    lookup.mockReset();

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`https://debates.geobrowser.io/debate/${VALID_ENTITY}?t=42`);
    expect(stay.headers.get('location')).toBe(`https://www.geobrowser.io/space/${VALID_SPACE}/${VALID_ENTITY}?t=42`);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('is off when DEBATE_PAGE_REDIRECT=off', async () => {
    enabled.mockReturnValue(false);
    const response = await proxy(request(PAGE, { headers: FROM_OUTSIDE }));
    expect(response.headers.get('location')).toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('only considers an entity’s own page, not its tabs or the space', async () => {
    for (const path of [`${PAGE}/activity`, `/space/${VALID_SPACE}`, `/space/${VALID_SPACE}/activity`]) {
      await proxy(request(path, { headers: FROM_OUTSIDE }));
    }
    expect(redirect).not.toHaveBeenCalled();
  });

  it('loads the lookup only on demand', () => {
    const source = fs.readFileSync(path.join(__dirname, 'proxy.ts'), 'utf8');
    expect(source).not.toMatch(/^import[^;]*debates-app-redirect/m);
  });
});
