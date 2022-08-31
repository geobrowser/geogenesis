import { Chain, chain as chainOptions } from 'wagmi'

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

export function getEtherActorURL(
  chain: Chain,
  contractAddress: string,
  methodName: string,
  ...args: string[]
) {
  // mumbai.ether.actor/0xContractAddress/methodName/arg0/arg1
  const pathComponents = [
    getEtherActorBaseURL(chain),
    contractAddress,
    methodName,
    ...args,
  ]

  return pathComponents.join('/')
}
