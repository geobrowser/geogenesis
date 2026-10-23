// @vitest-environment node
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import {
  STILL_HEIGHT,
  STILL_WIDTH,
  findDebateStillUrl,
  isAllowedStillUrl,
  normalizeDebateId,
  renderEmailStill,
} from './email-debate-still';

const DEBATE = '01a15b610e7075709ac5b5acd61c36d5';
const IMAGE_URL = '8a743832c0944a62b6650c3cc2f9c7bc';
const WEB_URL = '412ff593e9154012a43d4c27ec5c68b6';

/** A graph answer with one key frame carrying these values. */
function graphWith(values: { propertyId: string; text: string | null }[]) {
  return vi.fn(async () =>
    Response.json({
      data: { entity: { relationsList: [{ toEntity: { relationsList: [{ toEntity: { valuesList: values } }] } }] } },
    })
  ) as unknown as typeof fetch;
}

describe('normalizeDebateId', () => {
  it('accepts 32 hex, dashed or not, and nothing else', () => {
    expect(normalizeDebateId(DEBATE)).toBe(DEBATE);
    expect(normalizeDebateId('01a15b61-0e70-7570-9ac5-b5acd61c36d5')).toBe(DEBATE);
    expect(normalizeDebateId('01A15B610E7075709AC5B5ACD61C36D5')).toBe(DEBATE);
    expect(normalizeDebateId('") { x }')).toBeNull();
    expect(normalizeDebateId(DEBATE.slice(1))).toBeNull();
  });
});

describe('isAllowedStillUrl', () => {
  it('allows only the IPFS gateway and geobrowser.io over https', () => {
    expect(isAllowedStillUrl('https://mature-tomato-basilisk.myfilebase.com/ipfs/QmAbc')).toBe(true);
    expect(isAllowedStillUrl(`https://chat-api-testnet.geobrowser.io/debates/${DEBATE}/media`)).toBe(true);
    expect(isAllowedStillUrl('http://chat-api-testnet.geobrowser.io/x')).toBe(false);
    expect(isAllowedStillUrl('https://evil.example/x.jpg')).toBe(false);
    expect(isAllowedStillUrl('https://geobrowser.io.evil.example/x.jpg')).toBe(false);
    expect(isAllowedStillUrl('https://mature-tomato-basilisk.myfilebase.com/other/QmAbc')).toBe(false);
    expect(isAllowedStillUrl('not a url')).toBe(false);
  });
});

describe('findDebateStillUrl', () => {
  it('prefers the IPFS URL, through the gateway', async () => {
    const fetcher = graphWith([
      { propertyId: WEB_URL, text: `https://chat-api-testnet.geobrowser.io/debates/${DEBATE}/media` },
      { propertyId: IMAGE_URL, text: 'ipfs://QmStill' },
    ]);
    expect(await findDebateStillUrl(DEBATE, 'https://graph.test/graphql', fetcher)).toBe(
      'https://mature-tomato-basilisk.myfilebase.com/ipfs/QmStill'
    );
  });

  it("falls back to geo-chat's web URL", async () => {
    const web = `https://chat-api-testnet.geobrowser.io/debates/${DEBATE}/media/artifacts/preview_image/content`;
    expect(
      await findDebateStillUrl(DEBATE, 'https://graph.test/graphql', graphWith([{ propertyId: WEB_URL, text: web }]))
    ).toBe(web);
  });

  it('refuses a still hosted anywhere else', async () => {
    const fetcher = graphWith([{ propertyId: WEB_URL, text: 'https://evil.example/still.jpg' }]);
    expect(await findDebateStillUrl(DEBATE, 'https://graph.test/graphql', fetcher)).toBeNull();
  });

  it('is null for a debate with no video, or when the graph fails', async () => {
    const empty = vi.fn(async () => Response.json({ data: { entity: { relationsList: [] } } }));
    expect(await findDebateStillUrl(DEBATE, 'https://graph.test/graphql', empty as unknown as typeof fetch)).toBeNull();
    const down = vi.fn(async () => new Response('no', { status: 502 }));
    expect(await findDebateStillUrl(DEBATE, 'https://graph.test/graphql', down as unknown as typeof fetch)).toBeNull();
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
