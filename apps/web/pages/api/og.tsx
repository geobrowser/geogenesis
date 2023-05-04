import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

import { DEFAULT_OPENGRAPH_IMAGE } from '~/modules/constants';

export const config = {
  runtime: 'experimental-edge',
};

export default async function handler(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const hash = searchParams.get('hash');

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

  const image = `https://api.thegraph.com/ipfs/api/v0/cat?arg=${hash}`;

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
