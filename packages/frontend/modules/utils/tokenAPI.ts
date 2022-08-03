import { Chain, chain as chainOptions } from 'wagmi'
import { getContractAddress } from './getContractAddress'

function getEtherActorBaseURL(chain: Chain) {
  function getChainName(id: number) {
    switch (id) {
      case chainOptions.polygon.id:
        return 'polygon'
      case chainOptions.polygonMumbai.id:
        return 'mumbai'
      default:
        throw new Error(`Chain ${chain.id} not supported yet`)
    }
  }

  return `https://${getChainName(chain.id)}.ether.actor`
}

export async function fetchTokenURI(chain: Chain, tokenId: string | number) {
  const contractAddress = getContractAddress(chain)

  // mumbai.ether.actor/0xContractAddress/methodName/arg0
  const url = `${getEtherActorBaseURL(
    chain
  )}/${contractAddress}/tokenURI/${tokenId}`

  const response = await fetch(url)
  const tokenURI = await response.text()

  return tokenURI
}
