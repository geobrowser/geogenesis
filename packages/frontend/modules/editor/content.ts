import { GeoDocument__factory } from '@geogenesis/contracts'
import { ContractTransaction, Event, Signer } from 'ethers'
import { makeAutoObservable } from 'mobx'
import { Chain } from 'wagmi'
import { getContractAddress } from '../utils/getContractAddress'

async function findEvent(
  tx: ContractTransaction,
  name: string
): Promise<Event> {
  const receipt = await tx.wait()
  const event = receipt.events?.find((event) => event.event === name)
  if (!event) throw new Error(`Event '${name}' wasn't emitted`)
  return event
}

export class ContentService {
  /**
   * Markdown string
   */
  content: string = ''

  // TODO: We should probably inject the contract factory so we can mock it for testing
  constructor() {
    makeAutoObservable(this)
  }

  /**
   * Set markdown content
   */
  setContent(content: string) {
    this.content = content
  }

  async publish(signer: Signer | undefined, chain: Chain | undefined) {
    if (!signer || !chain) return

    const contractAddress = getContractAddress(chain)

    if (!contractAddress) {
      throw new Error(`Contract doesn't exist for chain '${chain.name}'`)
    }

    const contract = GeoDocument__factory.connect(contractAddress, signer)

    console.log('Minting...')

    const mintTx = await contract.mint({
      contentHash:
        'bafkreibrl5n5w5wqpdcdxcwaazheualemevr7ttxzbutiw74stdvrfhn2m',
      nextVersionId: 0,
      previousVersionId: 0,
    })

    const transferEvent = await findEvent(mintTx, 'Transfer')

    if (transferEvent.args) {
      console.log(`Successfully minted token ${transferEvent.args.tokenId}`)
    }
  }
}

export const contentService = new ContentService()
