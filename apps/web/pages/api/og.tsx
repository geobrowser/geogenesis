import type { NextApiRequest, NextApiResponse } from 'next'

import { OG_IMAGE_CONTENT_TYPE, generateOgImage } from '~/core/opengraph'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const image = await generateOgImage()
  if (!image) {
    res.status(500).end()
    return
  }
  const arrayBuffer = await image.arrayBuffer()
  res.setHeader('Content-Type', OG_IMAGE_CONTENT_TYPE)
  res.send(Buffer.from(arrayBuffer))
}
