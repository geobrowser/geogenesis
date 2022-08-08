import Cors from 'cors'
import type { NextApiRequest, NextApiResponse } from 'next'
import { runMiddleware } from '~/modules/server/middleware'

const cors = runMiddleware(Cors({ methods: ['GET', 'POST', 'OPTIONS'] }))

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query

  await cors(req, res)

  const host = req.headers.host

  const url = getScreenshotServiceURL({
    targetURL: `http://${host}/token/${id}`,
    waitForSelector: '.editor',
  })

  // We proxy the url to use cors and hide implementation details.
  await proxy(url, res)
}

/**
 * Use an external service to take a screenshot using Puppeteer (https://pptr.dev/)
 */
function getScreenshotServiceURL({
  targetURL,
  waitForSelector,
}: {
  targetURL: string
  waitForSelector?: string
}) {
  const url = new URL(
    'https://screenshot-service-kappa.vercel.app/thumbnail.png'
  )
  url.searchParams.set('width', '550')
  url.searchParams.set('height', '550')
  url.searchParams.set('url', targetURL)
  if (waitForSelector) {
    url.searchParams.set('waitForSelector', waitForSelector)
  }
  return url
}

/**
 * Proxy the url and update the response object
 */
async function proxy(url: URL, res: NextApiResponse) {
  try {
    const response = await fetch(url)

    if (response.status >= 400) {
      res.status(response.status).send(response.statusText)
      return
    }

    const data = await response.arrayBuffer()

    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })

    res.status(200).send(Buffer.from(data))
  } catch (error) {
    res.status(500).send((error as Error).message)
  }
}
