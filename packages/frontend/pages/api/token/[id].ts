import Cors from 'cors'
import type { NextApiRequest, NextApiResponse } from 'next'

// Helper method to wait for a middleware to execute before continuing
// And to throw an error when an error happens in a middleware
export function initMiddleware(middleware: any) {
  return (req: any, res: any) =>
    new Promise((resolve, reject) => {
      middleware(req, res, (result: any) => {
        if (result instanceof Error) {
          return reject(result)
        }
        return resolve(result)
      })
    })
}

// Initialize the cors middleware
const cors = initMiddleware(
  // You can read more about the available options here: https://github.com/expressjs/cors#configuration-options
  Cors({
    // Only allow requests with GET, POST and OPTIONS
    methods: ['GET', 'POST', 'OPTIONS'],
  })
)

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
  const { id } = req.query

  await cors(req, res)

  res.status(200).json({
    name: `Token #${id}`,
    description: `Description`,
    image: `https://picsum.photos/id/0/510/510`,
    // external_url: item.url,
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
