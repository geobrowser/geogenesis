import { MembershipRequested } from '../generated/Membership/Membership'
import { MembershipRequest } from '../generated/schema'
import { getChecksumAddress } from './get-checksum-address'

export function handleMembershipRequested(event: MembershipRequested): void {
  const userAccount = event.params.account
  const space = event.params.space

  const newRequest = new MembershipRequest(userAccount.toHex() + space.toHex())
  newRequest.requestor = getChecksumAddress(userAccount)
  newRequest.space = getChecksumAddress(space)
  newRequest.createdAt = event.block.timestamp

  newRequest.save()
}
