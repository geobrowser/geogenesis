import { log } from '@graphprotocol/graph-ts'
import { spaceRegistryAddress } from '../generated/addresses'
import { Space } from '../generated/schema'
import { handleSpaceAdded } from './actions'

export function bootstrapSpaceRegistry(): void {
  // Check if a bootstrapped type already exists
  if (Space.load(spaceRegistryAddress)) return
  log.debug(`Bootstrapping space registry!`, [])

  handleSpaceAdded(spaceRegistryAddress)
}
