import { Signer } from 'ethers'
import { Chain, chain } from 'wagmi'
import { Geode__factory } from '~/../contracts'
import { getEtherActorURL } from '~/modules/api/ether-actor'
import { findEvent } from '~/modules/api/publish-service'
import { getContractAddress } from '~/modules/utils/getContractAddress'

export async function createGeode(
  signer: Signer,
  chain: Chain,
  box: BoxParameters
): Promise<number> {
  const contractAddress = getContractAddress(chain, 'Geode')

  if (!contractAddress) {
    throw new Error(`Contract doesn't exist for chain '${chain.name}'`)
  }

  const contract = Geode__factory.connect(contractAddress, signer)

  console.log('Minting...')

  const mintTx = await contract.mint(box)

  const transferEvent = await findEvent(mintTx, 'Transfer')

  if (transferEvent.args) {
    console.log(`Successfully minted token ${transferEvent.args.tokenId}`)
    return transferEvent.args.tokenId
  }

  throw new Error('Minting failed')
}

export type BoxParameters = {
  contractAddress: string
  tokenId: string
}

export async function fetchGeodeTarget(
  geodeId: string
): Promise<BoxParameters> {
  const geodeContractAddress = getContractAddress(chain.polygonMumbai, 'Geode')!

  const targetUrl = getEtherActorURL(
    chain.polygonMumbai,
    geodeContractAddress,
    'boxParameters',
    geodeId
  )

  const response = await fetch(targetUrl)
  const [contractAddress, tokenId] = await response.json()

  return { contractAddress, tokenId }
}
