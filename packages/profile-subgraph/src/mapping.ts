import { Address, log } from '@graphprotocol/graph-ts'
import {
  GeoProfileHomeSpaceUpdated,
  GeoProfileRegistered,
} from '../generated/GeoProfileRegistry/GeoProfileRegistry'
import { GeoProfile } from '../generated/schema'
import { getChecksumAddress } from './get-checksum-address'

function getProfileId(account: string, onChainId: string): string {
  return account + '-' + onChainId
}

export function handleGeoProfileRegistered(event: GeoProfileRegistered): void {
  const userAccount = getChecksumAddress(event.params.account)
  const space = event.params.homeSpace
  const onChainId = event.params.id.toString()
  const id = getProfileId(userAccount, onChainId)

  const newProfile = new GeoProfile(id)
  newProfile.account = userAccount
  newProfile.homeSpace = space.toHexString()
  newProfile.createdAt = event.block.timestamp
  newProfile.save()

  log.info('New profile registered: {}', [id])
}

export function handleGeoProfileHomeSpaceUpdated(
  event: GeoProfileHomeSpaceUpdated
): void {
  const userAccount = getChecksumAddress(event.params.account)
  const space = event.params.homeSpace
  const onChainId = event.params.id.toString()
  const id = getProfileId(userAccount, onChainId)

  const profile = GeoProfile.load(id)

  // This should be handled at the contract level by requiring a profile to exist
  // when calling updateProfileHomeSpace. However, we still check here to be safe.
  if (!profile) {
    log.error(
      'Attempted to update home space on non-existent profile. User account – {}, Non-existing profile id – {}',
      [userAccount, id]
    )

    return
  }

  profile.homeSpace = space.toHexString()
  profile.save()

  log.info('Profile home space updated. Profile id – {}. New space – {}', [
    id,
    space.toHexString(),
  ])
}
