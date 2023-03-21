import { Root } from '@geogenesis/action-schema/assembly'
import { DataURI } from '@geogenesis/data-uri/assembly'
import { Address, BigInt, Bytes, ipfs, log } from '@graphprotocol/graph-ts'
import { JSON } from 'assemblyscript-json/assembly'
import { LogEntry, Proposal } from '../generated/schema'
import {
  getOrCreateAction,
  getOrCreateActionCount,
  handleAction,
} from './actions'

const IPFS_URI_SCHEME = 'ipfs://'

class EntryParams {
  index: BigInt
  space: string
  uri: string
  createdBy: Address
  createdAtBlock: BigInt
  createdAtTimestamp: BigInt
}

export function addEntry(params: EntryParams): void {
  const space = params.space
  const id = `${space}:${params.index.toHex()}`
  const uri = params.uri
  const createdBy = params.createdBy
  const createdAtBlock = params.createdAtBlock
  const createdAtTimestamp = params.createdAtTimestamp
    ? params.createdAtTimestamp
    : BigInt.fromI32(0)

  let entry = new LogEntry(id)

  entry.createdBy = createdBy
  entry.uri = uri
  entry.space = space
  entry.createdAtBlock = createdAtBlock

  log.debug(`Adding entry to space: ${space}`, [])

  if (uri.startsWith('data:')) {
    const dataURI = DataURI.parse(uri)

    if (dataURI) {
      const bytes = Bytes.fromUint8Array(dataURI.data)

      entry.mimeType = dataURI.mimeType
      entry.decoded = bytes

      if (entry.mimeType == 'application/json') {
        const root = handleActionData(
          bytes,
          space,
          createdAtBlock,
          createdBy,
          createdAtTimestamp
        )

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

      const root = handleActionData(
        bytes,
        space,
        createdAtBlock,
        createdBy,
        createdAtTimestamp
      )

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
  createdAtBlock: BigInt,
  createdBy: Address,
  createdAtTimestamp: BigInt
): Root | null {
  const json = JSON.parse(bytes)

  const root = Root.fromJSON(json)

  if (!root) return null

  handleRoot(root, space, createdAtBlock, createdBy, createdAtTimestamp)

  // Return decoded root for debugging purposes
  return root
}

export function getOrCreateProposal(
  id: string,
  createdBy: string,
  createdAt: BigInt
): Proposal {
  let proposal = Proposal.load(id)
  if (!proposal) {
    proposal = new Proposal(id)
    proposal.status = 'APPROVED' // NOTE Hardcoding this until we have a governance mechanism
    proposal.createdAt = createdAt
    proposal.createdBy = createdBy
    proposal.proposedVersions = []
    proposal.save()
  }
  return proposal as Proposal
}

function handleRoot(
  root: Root,
  space: string,
  createdAtBlock: BigInt,
  createdBy: Address,
  createdAtTimestamp: BigInt
): void {
  const proposalId = getOrCreateActionCount().count.toString()

  // create a proposal entity
  getOrCreateProposal(proposalId, createdBy.toString(), createdAtTimestamp)

  for (let i = 0; i < root.actions.length; i++) {
    const action = root.actions[i]
    // modify this to add the proposed action to the proposal entity
    handleAction(
      action,
      space,
      createdAtBlock,
      createdBy,
      proposalId,
      createdAtTimestamp
    )
  }
}
