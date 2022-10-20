import { Root } from '@geogenesis/action-schema/assembly'
import { DataURI } from '@geogenesis/data-uri/assembly'
import {
  Address,
  BigInt,
  ByteArray,
  Bytes,
  crypto,
  ipfs,
  log,
} from '@graphprotocol/graph-ts'
import { JSON } from 'assemblyscript-json/assembly'
import { LogEntry } from '../generated/schema'
import { handleAction } from './actions'

const IPFS_URI_SCHEME = 'ipfs://'

const ADMIN_ROLE = crypto.keccak256(ByteArray.fromUTF8('ADMIN_ROLE'))
const EDITOR_ROLE = crypto.keccak256(ByteArray.fromUTF8('EDITOR_ROLE'))

class EntryParams {
  index: BigInt
  space: string
  uri: string
  author: Address
  blocknumber: BigInt
}

export function addEntry(params: EntryParams): void {
  const space = params.space
  const id = `${space}:${params.index.toHex()}`
  const uri = params.uri
  const author = params.author
  const blocknumber = params.blocknumber

  let entry = new LogEntry(id)

  // const author = event.params.author
  // const uri = event.params.uri
  // const space = event.address.toHexString()

  entry.author = author
  entry.uri = uri
  entry.space = space
  entry.blockNumber = blocknumber

  log.debug(`Adding entry to space: ${space}`, [])

  if (uri.startsWith('data:')) {
    const dataURI = DataURI.parse(uri)

    if (dataURI) {
      const bytes = Bytes.fromUint8Array(dataURI.data)

      entry.mimeType = dataURI.mimeType
      entry.decoded = bytes

      if (entry.mimeType == 'application/json') {
        const root = handleActionData(bytes, space, blocknumber)

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

      const root = handleActionData(bytes, space, blocknumber)

      if (root) {
        entry.json = root.toJSON().toString()
      }
    }
  }

  entry.save()

  log.debug(`Indexed: ${entry.uri}`, [])
}

function handleActionData(
  bytes: Bytes,
  space: string,
  blocknumber: BigInt
): Root | null {
  const json = JSON.parse(bytes)

  const root = Root.fromJSON(json)

  if (!root) return null

  handleRoot(root, space, blocknumber)

  // Return decoded root for debugging purposes
  return root
}

function handleRoot(root: Root, space: string, blocknumber: BigInt): void {
  for (let i = 0; i < root.actions.length; i++) {
    const action = root.actions[i]

    handleAction(action, space, blocknumber)
  }
}
