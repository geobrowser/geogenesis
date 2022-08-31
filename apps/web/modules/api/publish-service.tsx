import { GeoDocument__factory } from '@geogenesis/contracts'
import { ContractTransaction, Event, Signer } from 'ethers'
import { makeAutoObservable } from 'mobx'
import { createContext, useContext } from 'react'
import { Chain } from 'wagmi'
import { getContractAddress } from '../utils/getContractAddress'
import { StorageClient } from './storage'

export async function findEvent(
  tx: ContractTransaction,
  name: string
): Promise<Event> {
  const receipt = await tx.wait()
  const event = receipt.events?.find((event) => event.event === name)
  if (!event) throw new Error(`Event '${name}' wasn't emitted`)
  return event
}

export type PublishState = 'idle' | 'uploading' | 'minting' | 'done'

export class PublishService {
  /**
   * Markdown string
   */
  content: string = ''

  storage: StorageClient
  geo: typeof GeoDocument__factory

  // TODO: We should probably inject the contract factory so we can mock it for testing
  constructor(storage: StorageClient, geo: typeof GeoDocument__factory) {
    makeAutoObservable(this)

    this.storage = storage
    this.geo = geo
  }

  /**
   * Set markdown content
   */
  setContent(content: string) {
    this.content = content
  }

  async publish(
    signer: Signer | undefined,
    chain: Chain | undefined,
    previousPageId: string | undefined,
    setPublishState: (nextState: PublishState) => void
  ) {
    if (!signer || !chain) return

    console.log('Uploading...')
    setPublishState('uploading')
    const cid = await this.storage.upload(this.content)

    console.log('Uploaded', cid)

    const contractAddress = getContractAddress(chain, 'GeoDocument')

    if (!contractAddress) {
      throw new Error(`Contract doesn't exist for chain '${chain.name}'`)
    }

    const contract = this.geo.connect(contractAddress, signer)

    console.log('Minting...')
    setPublishState('minting')
    const mintTx = await contract.mint({
      cid,
      parentId: Number(previousPageId),
    })

    const transferEvent = await findEvent(mintTx, 'Transfer')

    if (transferEvent.args) {
      console.log(`Successfully minted token ${transferEvent.args.tokenId}`)
      setPublishState('done')
      return transferEvent.args.tokenId
    }

    throw new Error('Minting failed')
  }
}

const PublishServiceContext = createContext<PublishService | undefined>(
  undefined
)

export const PublishServiceProvider = PublishServiceContext.Provider

export function usePublishService() {
  const context = useContext(PublishServiceContext)

  if (!context) {
    throw new Error(
      'usePublishService must be used within a PublishServiceProvider'
    )
  }

  return context
}
