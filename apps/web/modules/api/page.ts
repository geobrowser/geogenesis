import { Chain } from 'wagmi'
import { getReadingTime } from '../utils/content'
import { getEnsName } from './ens'
import { getStorageClient } from './storage'
import { fetchTokenOwner, fetchTokenParameters } from './token'

export type Page = {
  cid: string
  owner: string
  ens?: string
  content: string
  readingTime: number
}

export async function fetchPage(chain: Chain, tokenId: string): Promise<Page> {
  const tokenParametersPromise = fetchTokenParameters(chain, tokenId)
  const ownerPromise = fetchTokenOwner(chain, tokenId)

  const [{ cid }, content, { owner }, ens] = await Promise.all([
    tokenParametersPromise,
    tokenParametersPromise.then(({ cid }) =>
      getStorageClient().downloadText(cid)
    ),
    ownerPromise,
    ownerPromise.then(({ owner }) => getEnsName(owner)),
  ])

  return {
    cid,
    owner,
    content,
    readingTime: getReadingTime(content),
    ...(ens && { ens }),
  }
}
