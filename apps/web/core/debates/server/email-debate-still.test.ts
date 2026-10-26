// @vitest-environment node
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_IMAGE_SIZE_BYTES } from '~/core/constants';

import {
  STILL_HEIGHT,
  STILL_WIDTH,
  emailStillPlaceholder,
  emailStillSourceUrl,
  readImageBody,
  renderEmailStill,
} from './email-debate-still';

describe('emailStillSourceUrl', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_GEO_CHAT_API_BASE_URL', 'https://chat-api-testnet.geobrowser.io/'));
  afterEach(() => vi.unstubAllEnvs());

  it("is geo-chat's durable preview-image route for the debate, whatever the id's spelling", () => {
    const url =
      'https://chat-api-testnet.geobrowser.io/debates/01a15b610e7075709ac5b5acd61c36d5/media/artifacts/preview_image/content';
    expect(emailStillSourceUrl('01a15b610e7075709ac5b5acd61c36d5')).toBe(url);
    expect(emailStillSourceUrl('01A15B61-0E70-7570-9AC5-B5ACD61C36D5')).toBe(url);
  });
});

/** A response whose body arrives in chunks, with no Content-Length. */
const streamed = (chunks: Uint8Array[], init: ResponseInit = {}) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    init
  );

describe('readImageBody', () => {
  it('reads a body in chunks', async () => {
    const body = await readImageBody(streamed([new Uint8Array([1, 2]), new Uint8Array([3])]));
    expect([...(body ?? [])]).toEqual([1, 2, 3]);
  });

  it('stops at the cap when there is no Content-Length, and refuses a declared oversize body', async () => {
    const half = new Uint8Array(MAX_IMAGE_SIZE_BYTES / 2 + 1);
    expect(await readImageBody(streamed([half, half]))).toBeNull();
    const declared = new Response('x', { headers: { 'content-length': String(MAX_IMAGE_SIZE_BYTES + 1) } });
    expect(await readImageBody(declared)).toBeNull();
  });

  it('refuses a non-ok answer', async () => {
    expect(await readImageBody(new Response('missing', { status: 404 }))).toBeNull();
  });
});

describe('renderEmailStill', () => {
  it('crops a landscape still to the portrait frame, as an opaque JPEG', async () => {
    const landscape = await sharp({ create: { width: 800, height: 400, channels: 4, background: '#3366ccff' } })
      .png()
      .toBuffer();
    const meta = await sharp(await renderEmailStill(landscape)).metadata();
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(['jpeg', STILL_WIDTH, STILL_HEIGHT, false]);
  });

  it('draws the play button over the centre', async () => {
    const dark = await sharp({ create: { width: 156, height: 216, channels: 3, background: '#000000' } })
      .png()
      .toBuffer();
    const { data, info } = await sharp(await renderEmailStill(dark))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => data[(y * info.width + x) * info.channels];
    // White disc left of the triangle, the dark still in the corner.
    expect(at(STILL_WIDTH / 2 - 20, STILL_HEIGHT / 2)).toBeGreaterThan(200);
    expect(at(5, 5)).toBeLessThan(40);
  });

  it('refuses an image that decodes to too many pixels, and anything that is not an image', async () => {
    const huge = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: '#000' } })
      .png()
      .toBuffer();
    await expect(renderEmailStill(huge)).rejects.toThrow();
    await expect(renderEmailStill(Buffer.from('<html>not an image</html>'))).rejects.toThrow();
  });
});

describe('emailStillPlaceholder', () => {
  it('renders again after a failed render instead of keeping the failure', async () => {
    vi.resetModules();
    let calls = 0;
    vi.doMock('sharp', async () => {
      const real = (await vi.importActual<{ default: typeof sharp }>('sharp')).default;
      // sharp's chain returns the same instance; the failure arrives from toBuffer, as libvips' do.
      const fake = Object.assign((...args: Parameters<typeof sharp>) => {
        const instance = real(...args);
        if (++calls === 1) instance.toBuffer = () => Promise.reject(new Error('vips: out of memory'));
        return instance;
      }, real);
      return { default: fake };
    });
    const fresh = await import('./email-debate-still');
    await expect(fresh.emailStillPlaceholder()).rejects.toThrow('out of memory');
    expect((await fresh.emailStillPlaceholder()).length).toBeGreaterThan(0);
    vi.doUnmock('sharp');
    vi.resetModules();
  });

  it('is the placeholder grey with the button, made once', async () => {
    const first = await emailStillPlaceholder();
    expect(await emailStillPlaceholder()).toBe(first);
    const { data, info } = await sharp(first).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([STILL_WIDTH, STILL_HEIGHT]);
    expect(data[0]).toBeGreaterThan(220);
  });
});
