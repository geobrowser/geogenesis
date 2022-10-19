import { crypto, ByteArray } from '@graphprotocol/graph-ts'
import { Root } from '@geogenesis/action-schema/assembly'
import { DataURI } from '@geogenesis/data-uri/assembly'
import { Bytes, ipfs, log } from '@graphprotocol/graph-ts'
import { JSON } from 'assemblyscript-json/assembly'
import { EntryAdded, RoleGranted } from '../generated/SpaceRegistry/Log'

import { LogEntry } from '../generated/schema'
import { handleAction } from './actions'
import { bootstrapSpaceRegistry } from './bootstrap-space-registry'

bootstrapSpaceRegistry()

const IPFS_URI_SCHEME = 'ipfs://'

const ADMIN_ROLE = crypto.keccak256(ByteArray.fromUTF8('ADMIN_ROLE'))
const EDITOR_ROLE = crypto.keccak256(ByteArray.fromUTF8('EDITOR_ROLE'))

export function handleEntryAdded(event: EntryAdded): void {
  let entry = new LogEntry(event.params.index.toHex())

  const author = event.params.author
  const uri = event.params.uri
  const space = event.address.toHexString()

  entry.author = author
  entry.uri = uri
  entry.space = space

  if (uri.startsWith('data:')) {
    const dataURI = DataURI.parse(uri)

    if (dataURI) {
      const bytes = Bytes.fromUint8Array(dataURI.data)

      entry.mimeType = dataURI.mimeType
      entry.decoded = bytes

      if (entry.mimeType == 'application/json') {
        const root = handleActionData(bytes, space)

        if (root) {
          entry.json = root.toJSON().toString()
        }
      }
    }
  } else if (uri.startsWith(IPFS_URI_SCHEME)) {
    const cidString = uri.slice(IPFS_URI_SCHEME.length)
    const bytes = ipfs.cat(cidString)

    if (bytes) {
      entry.decoded = bytes

      const root = handleActionData(bytes, space)

      if (root) {
        entry.json = root.toJSON().toString()
      }
    }
  }

  entry.save()

  log.debug(`Indexed: ${entry.uri}`, [])
}

function handleActionData(bytes: Bytes, space: string): Root | null {
  const json = JSON.parse(bytes)

  const root = Root.fromJSON(json)

  if (!root) return null

  handleRoot(root, space)

  // Return decoded root for debugging purposes
  return root
}

function handleRoot(root: Root, space: string): void {
  for (let i = 0; i < root.actions.length; i++) {
    const action = root.actions[i]

    handleAction(action, space)
  }
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
