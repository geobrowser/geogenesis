import { crypto, ByteArray } from '@graphprotocol/graph-ts'
import { Space } from '../generated/schema'
// import { Root } from '@geogenesis/action-schema/assembly'
// import { DataURI } from '@geogenesis/data-uri/assembly'
// import { Bytes, ipfs, log } from '@graphprotocol/graph-ts'
// import { JSON } from 'assemblyscript-json/assembly'
import { EntryAdded, RoleGranted } from '../generated/templates/Space/Space'

// import { LogEntry, Space } from '../generated/schema'
// import { handleAction, handleSpaceAdded } from './actions'
import { addEntry } from './add-entry'
import { getChecksumAddress } from './get-checksum-address'

// const IPFS_URI_SCHEME = 'ipfs://'

// const ADMIN_ROLE = crypto.keccak256(ByteArray.fromUTF8('ADMIN_ROLE'))
// const EDITOR_ROLE = crypto.keccak256(ByteArray.fromUTF8('EDITOR_ROLE'))

export function handleEntryAdded(event: EntryAdded): void {
  const address = getChecksumAddress(event.address.toHexString())
  const space = address
  const index = event.params.index
  const uri = event.params.uri
  const author = event.params.author
  const createdAtBlock = event.block.number

  const rootSpace = Space.load(address)

  if (rootSpace && rootSpace.isRootSpace) {
    return
  }

  addEntry({ space, index, uri, author, createdAtBlock })
}

export function handleRoleGranted(event: RoleGranted): void {
  // const accountAddress = event.params.account.toHexString()
  // const account = (Account.load(accountAddress) || new Account(accountAddress))!
  // account.save()
  // const space = Space.load(event.address.toHexString())!
  // if (
  //   event.params.role == ADMIN_ROLE &&
  //   !space.admins.includes(accountAddress)
  // ) {
  //   space.admins = space.admins.concat([accountAddress])
  //   log.debug(`Granted admin role to ${accountAddress}`, [])
  // } else if (
  //   event.params.role == EDITOR_ROLE &&
  //   !space.editors.includes(accountAddress)
  // ) {
  //   space.editors = space.editors.concat([accountAddress])
  //   log.debug(`Granted editor role to ${accountAddress}`, [])
  // } else {
  //   log.debug(
  //     `Received unexpected role value: ${event.params.role.toHexString()}`,
  //     []
  //   )
  // }
  //   space.save()
}

// export function handleRoleRevoked(event: RoleRevoked): void {
//   const accountAddress = event.params.account.toHexString()
//   const account = (Account.load(accountAddress) || new Account(accountAddress))!
//   account.save()

//   const space = Space.load(event.address.toHexString())!

//   if (event.params.role == ADMIN_ROLE) {
//     space.admins = exclude(space.admins, accountAddress)
//     log.debug(`Revoked admin role from ${accountAddress}`, [])
//   } else if (event.params.role == EDITOR_ROLE) {
//     space.editors = exclude(space.editors, accountAddress)
//     log.debug(`Revoked editor role from ${accountAddress}`, [])
//   } else {
//     log.debug(
//       `Received unexpected role value: ${event.params.role.toHexString()}`,
//       []
//     )
//   }

//   space.save()
// }

function exclude<T>(array: T[], exclude: T): T[] {
  const index = array.indexOf(exclude)
  const newArray = array.slice(0)

  if (index > -1) {
    newArray.splice(index, 1)
  }

  return newArray
}
