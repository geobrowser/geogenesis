// @vitest-environment node
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STILL_HEIGHT, STILL_WIDTH, emailStillSource, renderEmailStill } from './email-debate-still';

const DEBATE = '01a15b610e7075709ac5b5acd61c36d5';

describe('emailStillSource', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_GEO_CHAT_API_BASE_URL', 'https://chat-api-testnet.geobrowser.io');
    vi.stubEnv('GEO_CHAT_API_BASE_URL', 'http://geo-chat.internal:8080');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('resolves IPFS through the gateway and keeps geo-chat URLs', () => {
    expect(emailStillSource('ipfs://QmStill')).toBe('https://mature-tomato-basilisk.myfilebase.com/ipfs/QmStill');
    const web = `https://chat-api-testnet.geobrowser.io/debates/${DEBATE}/media/artifacts/preview_image/content`;
    expect(emailStillSource(web)).toBe(web);
    expect(emailStillSource('http://geo-chat.internal:8080/x')).toBe('http://geo-chat.internal:8080/x');
  });

  it('refuses any other host, and nothing', () => {
    expect(emailStillSource('https://evil.example/still.jpg')).toBeNull();
    expect(emailStillSource('https://chat-api-testnet.geobrowser.io.evil.example/x')).toBeNull();
    expect(emailStillSource('not a url')).toBeNull();
    expect(emailStillSource(null)).toBeNull();
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

  it('draws the placeholder grey with the button when there is no still', async () => {
    const { data, info } = await sharp(await renderEmailStill(null))
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([STILL_WIDTH, STILL_HEIGHT]);
    expect(data[0]).toBeGreaterThan(220);
  });
});
