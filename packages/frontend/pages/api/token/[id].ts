import Cors from 'cors'
import type { NextApiRequest, NextApiResponse } from 'next'
import { chain } from 'wagmi'
import { getStorageClient } from '~/modules/api/storage'
import { fetchTokenParameters } from '~/modules/api/token'
import { runMiddleware } from '~/modules/server/middleware'

const cors = runMiddleware(Cors({ methods: ['GET', 'POST', 'OPTIONS'] }))

type Data = {
  name: string
  description: string
  image: string
  external_url?: string
  animation_url?: string
  attributes?: { trait_type: string; value: any }[]
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  let { id, cid } = req.query

  await cors(req, res)

  // Support cid in query params, but look it up if needed
  if (!cid) {
    const parameters = await fetchTokenParameters(
      chain.polygonMumbai,
      id as string
    )
    cid = parameters.cid
  }

  const content = await getStorageClient().downloadText(cid as string)

  const titleMatch = content.match(/^#\s+(.*)/)
  const title = titleMatch ? titleMatch[1] : undefined
  const summary = titleMatch
    ? content
        // Remove the title
        .slice(titleMatch[0].length)
        // Truncate if needed
        .slice(0, 256)
        // Remove excess whitespace
        .trim()
    : undefined

  res.setHeader('Cache-Control', 'max-age=86400')
  res.status(200).json({
    name: title ?? `Geo Document #${id}`,
    description: summary ?? '',
    image: `https://geogenesis.vercel.app/api/thumbnail/${id}`,
    external_url: `https://geogenesis.vercel.app/token/${id}`,
    // animation_url: item.download_url,
    // attributes: [
    //   {
    //     trait_type: 'Width',
    //     value: item.width,
    //   },
    //   {
    //     trait_type: 'Height',
    //     value: item.height,
    //   },
    // ],
  })
}
