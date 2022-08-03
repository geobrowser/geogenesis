import { Chain, chain as chainOptions } from 'wagmi'
import { getContractAddress } from '../utils/getContractAddress'

function getEtherActorBaseURL(chain: Chain) {
  function getChainName(id: number) {
    switch (id) {
      case chainOptions.polygon.id:
        return 'polygon'
      case chainOptions.polygonMumbai.id:
        return 'mumbai'
      default:
        throw new Error(`Chain '${chain.name}' not supported yet`)
    }
  }

  return `https://${getChainName(chain.id)}.ether.actor`
}

function getEtherActorURL(chain: Chain, methodName: string, ...args: string[]) {
  const contractAddress = getContractAddress(chain)

  // mumbai.ether.actor/0xContractAddress/methodName/arg0/arg1
  const pathComponents = [
    getEtherActorBaseURL(chain),
    contractAddress,
    methodName,
    ...args,
  ]

  return pathComponents.join('/')
}

export async function fetchTokenURI(chain: Chain, tokenId: string | number) {
  const url = getEtherActorURL(chain, 'tokenURI', String(tokenId))

  const response = await fetch(url)
  const tokenURI = await response.text()

  return tokenURI
}

export async function fetchTokenParameters(
  chain: Chain,
  tokenId: string | number
): Promise<{ contentHash: string }> {
  const url = getEtherActorURL(chain, 'tokenParameters', String(tokenId))

  const response = await fetch(url)
  const [cid] = await response.json()

  return { contentHash: cid }
}
