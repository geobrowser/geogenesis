import { Address, log } from '@graphprotocol/graph-ts'
import {
  GeoProfileHomeSpaceUpdated,
  GeoProfileRegistered,
} from '../generated/GeoProfileRegistry/GeoProfileRegistry'
import { GeoProfile } from '../generated/schema'

function getProfileId(account: Address, space: Address): string {
  return account.toHex() + '-' + space.toHex()
}

export function handleGeoProfileRegistered(event: GeoProfileRegistered): void {
  const userAccount = event.params.account
  const space = event.params.homeSpace
  const id = getProfileId(userAccount, space)

  const newProfile = new GeoProfile(id)
  newProfile.account = userAccount
  newProfile.homeSpace = space
  newProfile.createdAt = event.block.timestamp
  newProfile.save()

  log.info('New profile registered: {}', [id])
}

export function handleGeoProfileHomeSpaceUpdated(
  event: GeoProfileHomeSpaceUpdated
): void {
  const userAccount = event.params.account
  const space = event.params.homeSpace
  const id = getProfileId(userAccount, space)

  const profile = GeoProfile.load(id)

  // This should be handled at the contract level by requiring a profile to exist
  // when calling updateProfileHomeSpace. However, we still check here to be safe.
  if (!profile) {
    log.error(
      'Attempted to update home space on non-existent profile. User account – {}, Non-existing profile id – {}',
      [userAccount.toHex(), id]
    )

    return
  }

  profile.homeSpace = space
  profile.save()

  log.info('Profile home space updated. Profile id – {}. New space – {}', [
    id,
    space.toHex(),
  ])
}
