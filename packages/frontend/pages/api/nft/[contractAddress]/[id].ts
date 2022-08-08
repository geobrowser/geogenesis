import Cors from 'cors'
import type { NextApiRequest, NextApiResponse } from 'next'
import { chain } from 'wagmi'
import { NFTMetadata } from '~/modules/api/nft'
import { fetchNFTMetadata } from '~/modules/api/token'
import { runMiddleware } from '~/modules/server/middleware'

const cors = runMiddleware(Cors({ methods: ['GET', 'POST', 'OPTIONS'] }))

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<NFTMetadata>
) {
  let { id, contractAddress } = req.query

  await cors(req, res)

  const metadata = await fetchNFTMetadata(
    chain.polygonMumbai,
    contractAddress as string,
    id as string
  )

  // We probably don't want to cache here, since geodes can change
  // res.setHeader('Cache-Control', 'max-age=86400')
  res.status(200).json(metadata)
}
