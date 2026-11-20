import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { DEBATE_TYPE_ID } from '../ontology';
import { renderShareCard, sharePlayerCardResponse } from './share-player-card';

const SPACE_HEX = '89bd89bf28ff8a0963faf92a8c905e20';
const DEBATE_HEX = '01a1ef881e697960ae5db5b6d3ebaacd';

// The social-v6 layout at full size; the still is half of it, as geo-chat's poster is.
const LAYOUT = {
  canvas: { x: 0, y: 0, width: 1080, height: 1920 },
  header: { x: 0, y: 0, width: 1080, height: 324 },
  slot_1_video: { x: 32, y: 324, width: 1016, height: 762 },
  slot_2_video: { x: 32, y: 1118, width: 1016, height: 762 },
  vs_badge: { x: 883, y: 1062, width: 132, height: 80 },
};

/** A 540×960 still: an off-white header band, a red top speaker and a blue bottom one. */
async function still() {
  return sharp({ create: { width: 540, height: 960, channels: 3, background: { r: 250, g: 250, b: 248 } } })
    .composite([
      { input: { create: { width: 508, height: 381, channels: 3, background: '#f00' } }, left: 16, top: 162 },
      { input: { create: { width: 508, height: 381, channels: 3, background: '#00f' } }, left: 16, top: 559 },
    ])
    .jpeg()
    .toBuffer();
}

async function pixel(image: Buffer, left: number, top: number) {
  const { data } = await sharp(image)
    .extract({ left, top, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}

describe('renderShareCard', () => {
  it('lays the header across the top and the two speakers side by side, at 1200×630', async () => {
    const card = await renderShareCard(await still(), LAYOUT);
    expect(await sharp(card).metadata()).toMatchObject({ width: 1200, height: 630 });

    const [r1, , b1] = await pixel(card, 300, 400);
    const [r2, , b2] = await pixel(card, 900, 400);
    expect(r1).toBeGreaterThan(200);
    expect(b1).toBeLessThan(60);
    expect(b2).toBeGreaterThan(200);
    expect(r2).toBeLessThan(60);
    // The fill continues the header band's own colour rather than a seam of pure white.
    const corner = await pixel(card, 2, 2);
    corner.forEach(channel => expect(Math.abs((channel ?? 0) - 249)).toBeLessThan(6));
  });
});

describe('sharePlayerCardResponse', () => {
  const params = { spaceId: SPACE_HEX, debateId: DEBATE_HEX };
  const video = (metadata: Record<string, unknown>) => ({ artifacts: [{ kind: 'social_video', metadata }] });
  const deps = (media: unknown, imageBody?: Buffer) => ({
    enabled: true,
    fetchEntity: vi.fn().mockResolvedValue({ name: 'x', types: [{ id: DEBATE_TYPE_ID }], values: [] }),
    fetchVisibility: vi.fn().mockResolvedValue('visible'),
    fetchMedia: vi.fn().mockResolvedValue(media),
    fetchImpl: vi.fn().mockResolvedValue(new Response(imageBody ? new Uint8Array(imageBody) : null)),
  });

  it('serves the card as a JPEG', async () => {
    const response = await sharePlayerCardResponse(params, deps(video({ layout: LAYOUT }), await still()));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
  });

  it('404s a render with no recorded layout, an unreadable still, or a debate the player refuses', async () => {
    expect((await sharePlayerCardResponse(params, deps(video({}), await still()))).status).toBe(404);
    expect((await sharePlayerCardResponse(params, deps(video({ layout: LAYOUT })))).status).toBe(404);
    const removed = {
      ...deps(video({ layout: LAYOUT }), await still()),
      fetchVisibility: vi.fn().mockResolvedValue('removed'),
    };
    expect((await sharePlayerCardResponse(params, removed)).status).toBe(404);
    expect(removed.fetchImpl).not.toHaveBeenCalled();
  });
});
