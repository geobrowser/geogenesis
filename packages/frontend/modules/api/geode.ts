import { Signer } from 'ethers'
import { Chain } from 'wagmi'
import { Geode__factory } from '~/../contracts'
import { findEvent } from '~/modules/api/publish-service'
import { getContractAddress } from '~/modules/utils/getContractAddress'

export async function createGeode(
  signer: Signer,
  chain: Chain,
  box: { contractAddress: string; tokenId: number }
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
