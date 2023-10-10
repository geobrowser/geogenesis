import { MembershipRequested } from '../generated/Membership/Membership'
import { MembershipRequest } from '../generated/schema'

export function handleMembershipRequested(event: MembershipRequested): void {
  const userAccount = event.params.account
  const space = event.params.space

  const newRequest = new MembershipRequest(userAccount.toHex() + space.toHex())
  newRequest.requestor = userAccount
  newRequest.space = space

  newRequest.save()
}
