import { addresses } from '@geogenesis/contracts'
import { Chain } from 'wagmi'

function isSupportedChain(chainId: string): chainId is keyof typeof addresses {
  return chainId in addresses
}

type ContractName = 'GeoDocument' | 'Proposal' | 'Geode' | 'Controller'

export function getContractAddress(chain: Chain, contractName: ContractName) {
  const chainId = String(chain.id)

  if (!isSupportedChain(chainId)) return

  return addresses[chainId][contractName].address
}
