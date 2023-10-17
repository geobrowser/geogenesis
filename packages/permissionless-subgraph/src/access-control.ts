import {
  Address,
  BigInt,
  ByteArray,
  crypto,
  log,
} from '@graphprotocol/graph-ts'
import { Account, Space } from '../generated/schema'
import { getChecksumAddress } from './get-checksum-address'

class RoleAddedParams {
  account: Address
  role: ByteArray
  space: Address
  createdAtBlock: BigInt
}

const ADMIN_ROLE = crypto.keccak256(ByteArray.fromUTF8('ADMIN_ROLE'))
const EDITOR_CONTROLLER_ROLE = crypto.keccak256(
  ByteArray.fromUTF8('EDITOR_CONTROLLER_ROLE')
)
const EDITOR_ROLE = crypto.keccak256(ByteArray.fromUTF8('EDITOR_ROLE'))

export function addRole(params: RoleAddedParams): void {
  const address = getChecksumAddress(params.account)
  const role = params.role
  const spaceAddress = params.space.toHexString()

  let space = Space.load(spaceAddress)

  if (!space) {
    log.error(`Space {} not found when adding role for {}`, [
      spaceAddress,
      address,
    ])

    return
  }

  const account = (Account.load(address) || new Account(address))!
  account.save()

  if (role == ADMIN_ROLE && !space.admins.includes(address)) {
    space.admins = space.admins.concat([address])
    log.debug(`Granted admin role to ${address}`, [])
  } else if (role == EDITOR_ROLE && !space.editors.includes(address)) {
    space.editors = space.editors.concat([address])
    log.debug(`Granted editor role to ${address}`, [])
  } else if (
    role == EDITOR_CONTROLLER_ROLE &&
    !space.editorControllers.includes(address)
  ) {
    space.editorControllers = space.editorControllers.concat([address])
    log.debug(`Granted editor controller role to ${address}`, [])
  } else {
    log.debug(`Received unexpected role value: ${role.toHexString()}`, [])
  }
  space.save()
}

export function removeRole(params: RoleAddedParams): void {
  const address = getChecksumAddress(params.account)
  const role = params.role
  const spaceAddress = params.space.toHexString()

  let space = Space.load(spaceAddress)

  if (!space) {
    log.error(`Space {} not found when removing role for {}`, [
      spaceAddress,
      address,
    ])

    return
  }

  if (role == ADMIN_ROLE) {
    space.admins = exclude(space.admins, address)
    log.debug(`Revoked admin role from ${address}`, [])
  } else if (role == EDITOR_ROLE) {
    space.editors = exclude(space.editors, address)
    log.debug(`Revoked editor role from ${address}`, [])
  } else if (role == EDITOR_CONTROLLER_ROLE) {
    space.editorControllers = exclude(space.editorControllers, address)
    log.debug(`Revoked editor controller role from ${address}`, [])
  } else {
    log.debug(`Received unexpected role value: ${role.toHexString()}`, [])
  }

  space.save()
}

function exclude<T>(array: T[], exclude: T): T[] {
  const index = array.indexOf(exclude)
  const newArray = array.slice(0)

  if (index > -1) {
    newArray.splice(index, 1)
  }

  return newArray
}
