import { GeoProfileRegistered } from '../generated/GeoProfileRegistry/GeoProfileRegistry'
import { GeoProfile } from '../generated/schema'

export function handleGeoProfileRegistered(event: GeoProfileRegistered): void {
  const userAccount = event.params.account
  const space = event.params.homeSpace
  const id = userAccount.toHex() + '-' + space.toHex()

  const newProfile = new GeoProfile(id)
  newProfile.account = userAccount
  newProfile.homeSpace = space
  newProfile.createdAt = event.block.timestamp

  newProfile.save()
}

// export function handleGeoProfileHomeSpaceUpdated() {
//   return
// }
