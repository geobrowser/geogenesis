import Cors from 'cors'
import type { NextApiRequest, NextApiResponse } from 'next'
import { chain } from 'wagmi'
import { getStorageClient } from '~/modules/api/storage'
import { fetchTokenParameters } from '~/modules/api/token'
import { runMiddleware } from '~/modules/server/middleware'
import { extractMetadata } from '~/modules/utils/extractMetadata'

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

  const { title, summary } = extractMetadata(content)

  const host = req.headers.host

  // res.setHeader('Cache-Control', 'max-age=86400')
  res.status(200).json({
    name: title ?? `Geo Document #${id}`,
    description: summary ?? '',
    image: `http://${host}/api/thumbnail/${id}`,
    external_url: `http://${host}/page/${id}`,
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
