import { chain } from 'wagmi'
import { getContractAddress } from '../utils/getContractAddress'
import { BoxParameters, fetchGeodeInner } from './geode'
import { NFTMetadata } from './nft'
import { fetchPage, Page } from './page'

export type GeodeItem = {
  geodeId: string
  page?: Page
  inner: BoxParameters
  innerMetadata: NFTMetadata
}

export async function fetchGeodeItem(host: string, geodeId: string) {
  const inner = await fetchGeodeInner(geodeId)
  const contractAddress = getContractAddress(chain.polygonMumbai, 'Geode')!

  const url = `http://${host}/api/nft/${contractAddress}/${geodeId}`
  const response = await fetch(url)
  const innerMetadata = await response.json()

  const result: GeodeItem = { geodeId, inner, innerMetadata }

  if (
    inner.contractAddress ===
    getContractAddress(chain.polygonMumbai, 'GeoDocument')
  ) {
    result.page = await fetchPage(chain.polygonMumbai, String(inner.tokenId))
  }

  return result
}
