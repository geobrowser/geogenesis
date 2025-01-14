import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

import { DEFAULT_OPENGRAPH_IMAGE, IPFS_GATEWAY_READ_PATH } from '~/core/constants';

export const runtime = 'edge';

export default async function handler(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  let hash = searchParams.get('hash') ?? '';

  if (hash.includes('.png')) {
    hash = hash.split('.')[0];
  }

  if (!hash) {
    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            background: 'white',
          }}
        >
          <img
            src={DEFAULT_OPENGRAPH_IMAGE}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
            alt=""
          />
        </div>
      ),
      {
        width: 1200,
        height: 675,
      }
    );
  }

  const image = `${IPFS_GATEWAY_READ_PATH}${hash}`;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          background: 'white',
        }}
      >
        <img
          src={image}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
          alt=""
        />
      </div>
    ),
    {
      width: 1200,
      height: 675,
    }
  );
}
