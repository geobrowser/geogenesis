import { Address, log } from '@graphprotocol/graph-ts'
import { MembershipRequested } from '../generated/Membership/Membership'
import { MembershipRequest } from '../generated/schema'
import { getChecksumAddress } from './get-checksum-address'

function getMembershipRequestId(userAccount: Address, space: Address): string {
  return getChecksumAddress(userAccount) + getChecksumAddress(space)
}

export function handleMembershipRequested(event: MembershipRequested): void {
  const userAccount = event.params.account
  const space = event.params.space

  const newRequest = new MembershipRequest(
    getMembershipRequestId(userAccount, space)
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
