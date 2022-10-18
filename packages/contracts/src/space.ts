/* eslint-disable node/no-missing-import */
import { SpaceRegistry } from '../build/types'
import {
  SpaceAddedEventObject,
  SpaceRemovedEventObject,
} from '../build/types/contracts/SpaceRegistry.sol/SpaceRegistry'
import { findEvent } from './findEvent'

export async function addSpace(
  spaceRegistryContract: SpaceRegistry,
  address: string
) {
  const mintTx = await spaceRegistryContract.addSpace(address)
  const transferEvent = await findEvent(mintTx, 'SpaceAdded')
  const eventObject = transferEvent.args as unknown as SpaceAddedEventObject
  return eventObject
}

export async function removeSpace(
  spaceRegistryContract: SpaceRegistry,
  address: string
) {
  const mintTx = await spaceRegistryContract.removeSpace(address)
  const transferEvent = await findEvent(mintTx, 'SpaceRemoved')
  const eventObject = transferEvent.args as unknown as SpaceRemovedEventObject
  return eventObject
}
