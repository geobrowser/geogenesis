import { Root } from '@geogenesis/action-schema/assembly'
import { DataURI } from '@geogenesis/data-uri/assembly'
import { Bytes, ipfs, log } from '@graphprotocol/graph-ts'
import { JSON } from 'assemblyscript-json/assembly'
import { EntryAdded } from '../generated/templates/Log/Log'
import { Log } from '../generated/templates'
import { SpaceAdded } from '../generated/SpaceRegistry/SpaceRegistry'
import { LogEntry, Space } from '../generated/schema'
import { handleAction } from './actions'
import { bootstrap } from './bootstrap'

const IPFS_URI_SCHEME = 'ipfs://'

export function handleSpaceAdded(event: SpaceAdded): void {
  let space = new Space(event.params.space.toHexString())
  space.save()

  Log.create(event.params.space)
  bootstrap(space.id)
}

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
