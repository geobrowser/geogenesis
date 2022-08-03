import { addresses, GeoDocument__factory } from '@geogenesis/contracts'
import { makeAutoObservable } from 'mobx'
import { ContractTransaction, Event, Signer } from 'ethers'
import { Chain } from 'wagmi'

function isSupportedChain(chainId: string): chainId is keyof typeof addresses {
  return chainId in addresses
}

async function findEvent(
  tx: ContractTransaction,
  name: string
): Promise<Event> {
  const receipt = await tx.wait()
  const event = receipt.events?.find((event) => event.event === name)
  if (!event) throw new Error(`Event '${name}' wasn't emitted`)
  return event
}

export class Content {
  content: string = ''

  constructor() {
    makeAutoObservable(this)
  }

  setContent(content: string) {
    this.content = content
  }

  async publish(signer: Signer | undefined, chain: Chain | undefined) {
    if (!signer || !chain) return

    const chainId = String(chain.id)

    if (!isSupportedChain(chainId)) return

    const contractAddress = addresses[chainId].GeoDocument.address

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

export const contentService = new Content()
