// @vitest-environment node
import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { FILEBASE_GATEWAY_READ_PATH, LIGHTHOUSE_GATEWAY_READ_PATH } from '~/core/constants';

import { inlineOgImage } from './og-image-inline';

let png: Buffer;
beforeAll(async () => {
  png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#c00' } })
    .png()
    .toBuffer();
});

const image = () => new Response(new Uint8Array(png), { status: 200, headers: { 'content-type': 'image/png' } });
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

describe('inlineOgImage', () => {
  it.each([
    'http://127.0.0.1/a.png',
    'http://localhost:3000/a.png',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.5/a.png',
    'http://[::1]/a.png',
    'https://example.com/a.png',
  ])('refuses %s without fetching it', async url => {
    const fetchImpl = vi.fn();
    expect(await inlineOgImage(url, 64, 1_000, fetchImpl)).toEqual({ src: null, timedOut: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('inlines an image from our gateways, ipfs:// included, without following redirects itself', async () => {
    const fetchImpl = vi.fn(async () => image());
    const direct = await inlineOgImage(`${FILEBASE_GATEWAY_READ_PATH}QmA`, 64, 1_000, fetchImpl);
    expect(direct.src).toMatch(/^data:image\/jpeg;base64,/);
    const viaIpfs = await inlineOgImage('ipfs://QmB', 64, 1_000, fetchImpl);
    expect(viaIpfs.src).toMatch(/^data:image\/jpeg;base64,/);
    for (const [, init] of fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>)
      expect(init.redirect).toBe('manual');
  });

  it('refuses a redirect off the allowlist, and follows one to another gateway', async () => {
    const offList = vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith(FILEBASE_GATEWAY_READ_PATH) ? redirect('http://127.0.0.1/secret') : image()
    );
    expect(await inlineOgImage(`${FILEBASE_GATEWAY_READ_PATH}QmA`, 64, 1_000, offList)).toEqual({
      src: null,
      timedOut: false,
    });
    expect(offList).toHaveBeenCalledTimes(1);

    const toGateway = vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith(FILEBASE_GATEWAY_READ_PATH) ? redirect(`${LIGHTHOUSE_GATEWAY_READ_PATH}QmA`) : image()
    );
    expect((await inlineOgImage(`${FILEBASE_GATEWAY_READ_PATH}QmA`, 64, 1_000, toGateway)).src).toMatch(/^data:/);
    expect(toGateway).toHaveBeenCalledTimes(2);
  });

  it('follows at most one redirect', async () => {
    const loop = vi.fn(async (input: RequestInfo | URL) =>
      redirect(
        String(input).includes('QmA') ? `${LIGHTHOUSE_GATEWAY_READ_PATH}QmB` : `${FILEBASE_GATEWAY_READ_PATH}QmA`
      )
    );
    expect((await inlineOgImage(`${FILEBASE_GATEWAY_READ_PATH}QmA`, 64, 1_000, loop)).src).toBeNull();
    expect(loop).toHaveBeenCalledTimes(2);
  });

  it('rasterises an author PNG data URI and refuses SVG, other types and oversize ones', async () => {
    const fetchImpl = vi.fn();
    const ok = await inlineOgImage(`data:image/png;base64,${png.toString('base64')}`, 64, 1_000, fetchImpl);
    expect(ok.src).toMatch(/^data:image\/jpeg;base64,/);

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>').toString('base64');
    const big = Buffer.alloc(600 * 1024).toString('base64');
    for (const uri of [
      `data:image/svg+xml;base64,${svg}`,
      `data:image/png;base64,${svg}`,
      'data:image/png,not-base64',
      `data:image/png;base64,${big}`,
    ])
      expect((await inlineOgImage(uri, 64, 1_000, fetchImpl)).src).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a body over the cap, by Content-Length or while streaming', async () => {
    const cancelled = vi.fn();
    const declared = vi.fn(
      async () =>
        new Response(new ReadableStream({ cancel: cancelled }), {
          status: 200,
          headers: { 'content-type': 'image/png', 'content-length': String(9 * 1024 * 1024) },
        })
    );
    expect((await inlineOgImage(`${FILEBASE_GATEWAY_READ_PATH}QmA`, 64, 1_000, declared)).src).toBeNull();
    expect(cancelled).toHaveBeenCalled();

    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const streamed = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              sent++;
              controller.enqueue(chunk);
            },
          }),
          { status: 200, headers: { 'content-type': 'image/png' } }
        )
    );
    expect((await inlineOgImage(`${FILEBASE_GATEWAY_READ_PATH}QmA`, 64, 1_000, streamed)).src).toBeNull();
    expect(sent).toBeLessThanOrEqual(10);
  });

  it('cancels a redirect’s body', async () => {
    const cancelled = vi.fn();
    const fetchImpl = vi.fn(
      async () =>
        new Response(new ReadableStream({ cancel: cancelled }), {
          status: 302,
          headers: { location: 'http://127.0.0.1/secret' },
        })
    );
    await inlineOgImage(`${FILEBASE_GATEWAY_READ_PATH}QmA`, 64, 1_000, fetchImpl);
    expect(cancelled).toHaveBeenCalled();
  });
});
