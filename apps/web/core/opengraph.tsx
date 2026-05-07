import { ImageResponse } from 'next/og';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getImagePath } from '~/core/utils/utils';

export const OG_IMAGE_SIZE = { width: 600, height: 315 };
export const OG_IMAGE_CONTENT_TYPE = 'image/png';

// Read the default share image from disk and embed as a data URL so the build
// doesn't depend on the asset already being deployed at geobrowser.io.
const DEFAULT_OG_IMAGE = `data:image/png;base64,${readFileSync(
  join(process.cwd(), 'public/static/geo-social-image-v3.png')
).toString('base64')}`;

export function firstLine(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const line = text.split(/\r?\n/)[0] ?? text;
  return line.trim() || undefined;
}

export async function generateOgImage(imageUrl?: string) {
  const src = imageUrl ? getImagePath(imageUrl) : DEFAULT_OG_IMAGE;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#fff',
      }}
    >
      <img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </div>,
    OG_IMAGE_SIZE
  );
}
