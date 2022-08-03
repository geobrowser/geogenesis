import { addresses } from '@geogenesis/contracts'
import { Chain } from 'wagmi'

function isSupportedChain(chainId: string): chainId is keyof typeof addresses {
  return chainId in addresses
}

export function getContractAddress(chain: Chain) {
  const chainId = String(chain.id)

  if (!isSupportedChain(chainId)) return

  return addresses[chainId].GeoDocument.address
}
