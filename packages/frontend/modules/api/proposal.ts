import { BigNumber, Signer } from 'ethers'
import { chain, Chain } from 'wagmi'
import { Proposal__factory } from '~/../contracts'
import { findEvent } from '~/modules/api/publish-service'
import { getContractAddress } from '~/modules/utils/getContractAddress'
import { getEtherActorURL } from './ether-actor'
import { BoxParameters } from './geode'

export async function createProposal(
  signer: Signer,
  chain: Chain,
  parameters: Omit<ProposalParameters, 'targetVersion'>
): Promise<number> {
  const contractAddress = getContractAddress(chain, 'Proposal')

  if (!contractAddress) {
    throw new Error(`Contract doesn't exist for chain '${chain.name}'`)
  }

  const contract = Proposal__factory.connect(contractAddress, signer)

  console.log('Minting...')

  const mintTx = await contract.mint(parameters)

  const transferEvent = await findEvent(mintTx, 'Transfer')

  if (transferEvent.args) {
    console.log(`Successfully minted token ${transferEvent.args.tokenId}`)
    return transferEvent.args.tokenId
  }

  throw new Error('Minting failed')
}

export async function mergeProposal(
  signer: Signer,
  chain: Chain,
  proposalId: string
): Promise<void> {
  const contractAddress = getContractAddress(chain, 'Proposal')

  if (!contractAddress) {
    throw new Error(`Contract doesn't exist for chain '${chain.name}'`)
  }

  const contract = Proposal__factory.connect(contractAddress, signer)

  console.log('Merging...')

  const mergeTx = await contract.merge(proposalId)

  const event = await findEvent(mergeTx, 'SetBoxParameters')

  console.log('Successfully merged', event)
}

export type ProposalParameters = {
  target: BoxParameters
  targetVersion: string
  proposed: BoxParameters
}

export async function fetchProposalParameters(
  proposalId: string
): Promise<ProposalParameters> {
  const geodeContractAddress = getContractAddress(
    chain.polygonMumbai,
    'Proposal'
  )!

  const targetUrl = getEtherActorURL(
    chain.polygonMumbai,
    geodeContractAddress,
    'proposalParameters',
    proposalId
  )

  const response = await fetch(targetUrl)
  const [
    [targetAddress, targetTokenId],
    targetVersion,
    [proposedAddress, proposedTokenId],
  ] = await response.json()

  return {
    target: {
      contractAddress: targetAddress,
      tokenId: BigNumber.from(targetTokenId).toString(),
    },
    targetVersion: String(targetVersion),
    proposed: {
      contractAddress: proposedAddress,
      tokenId: BigNumber.from(proposedTokenId).toString(),
    },
  }
}
