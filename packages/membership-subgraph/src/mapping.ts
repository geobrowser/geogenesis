import { log } from '@graphprotocol/graph-ts'
import { MembershipRequested } from '../generated/Membership/Membership'
import { MembershipRequest } from '../generated/schema'
import { getChecksumAddress } from './get-checksum-address'

export function handleMembershipRequested(event: MembershipRequested): void {
  const userAccount = event.params.account
  const space = event.params.space

  const request = MembershipRequest.load(
    getChecksumAddress(userAccount) + getChecksumAddress(space)
  )

  if (request) {
    log.warning('Membership request already exists for user {} in space {}', [
      getChecksumAddress(userAccount),
      getChecksumAddress(space),
    ])
    return
  }

  const newRequest = new MembershipRequest(
    getChecksumAddress(userAccount) + getChecksumAddress(space)
  )

  newRequest.requestor = getChecksumAddress(userAccount)
  newRequest.space = getChecksumAddress(space)
  newRequest.createdAt = event.block.timestamp

  log.debug('New membership request created for user {} in space {}', [
    getChecksumAddress(userAccount),
    getChecksumAddress(space),
  ])

  newRequest.save()
}
