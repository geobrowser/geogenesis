/* eslint-disable @typescript-eslint/no-explicit-any */
import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

export const config = {
  runtime: 'experimental-edge',
};

const defaultImage = fetch(new URL('./static/geo-social-image-v2.png', import.meta.url)).then(res => res.arrayBuffer());

export default async function handler(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const hash = searchParams.get('hash');

  if (!hash) {
    const defaultImageData = await defaultImage;

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
            src={defaultImageData as any}
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
          src={`https://api.thegraph.com/ipfs/api/v0/cat?arg=${hash}`}
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
