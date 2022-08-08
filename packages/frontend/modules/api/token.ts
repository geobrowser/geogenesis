import { Chain } from 'wagmi'
import { getContractAddress } from '../utils/getContractAddress'
import { getEtherActorURL } from './ether-actor'
import { NFTMetadata } from './nft'

function getGeoDocumentAddress(chain: Chain) {
  const address = getContractAddress(chain, 'GeoDocument')

  if (!address) {
    throw new Error(`GeoDocument address not found for ${chain.name}`)
  }

  return address
}

export async function fetchTokenURI(chain: Chain, tokenId: string | number) {
  const contractAddress = getGeoDocumentAddress(chain)

  const url = getEtherActorURL(
    chain,
    contractAddress,
    'tokenURI',
    String(tokenId)
  )

  const response = await fetch(url)
  const tokenURI = await response.text()

  return tokenURI
}

export async function fetchNFTMetadata(
  chain: Chain,
  contractAddress: string,
  tokenId: string | number
) {
  const url = getEtherActorURL(
    chain,
    contractAddress,
    'tokenURI',
    String(tokenId)
  )

  const tokenURIResponse = await fetch(url)
  const tokenURI = await tokenURIResponse.text()

  const metadataResponse = await fetch(tokenURI)
  const metadata = await metadataResponse.json()

  return metadata as NFTMetadata
}

export async function fetchTokenParameters(
  chain: Chain,
  tokenId: string | number
): Promise<{ cid: string }> {
  const contractAddress = getGeoDocumentAddress(chain)

  const url = getEtherActorURL(
    chain,
    contractAddress,
    'tokenParameters',
    String(tokenId)
  )

  const response = await fetch(url)
  const [cid] = await response.json()

  return { cid }
}

export async function fetchTokenOwner(
  chain: Chain,
  tokenId: string | number
): Promise<{ owner: string }> {
  const contractAddress = getGeoDocumentAddress(chain)

  const url = getEtherActorURL(
    chain,
    contractAddress,
    'ownerOf',
    String(tokenId)
  )

  const response = await fetch(url)
  // If we use JSON it will crash due to the "0x" prefix in addresses
  const owner = await response.text()

  return { owner }
}
