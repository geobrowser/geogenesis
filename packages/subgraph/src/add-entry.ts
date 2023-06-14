import { Action, Root } from '@geogenesis/action-schema/assembly'
import { DataURI } from '@geogenesis/data-uri/assembly'
import { Address, BigInt, Bytes, ipfs, log } from '@graphprotocol/graph-ts'
import { JSON } from 'assemblyscript-json/assembly'
import { LogEntry, Proposal } from '../generated/schema'
import {
  createProposedVersion,
  createVersion,
  getOrCreateAccount,
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
  createdBy: Address,
  createdAt: BigInt,
  space: string,
  proposalName: string | null,
  createdAtBlock: BigInt
): Proposal {
  let proposal = Proposal.load(id)
  if (!proposal) {
    proposal = new Proposal(id)
    proposal.status = 'APPROVED' // NOTE Hardcoding this until we have a governance mechanism
    proposal.createdAt = createdAt
    proposal.createdBy = getOrCreateAccount(createdBy).id
    proposal.proposedVersions = []
    proposal.space = space
    proposal.name = proposalName
    proposal.createdAtBlock = createdAtBlock
    proposal.save()
  }
  return proposal as Proposal
}

export function getEntityId(action: Action): string | null {
  let asCreateTripleAction = action.asCreateTripleAction()
  if (asCreateTripleAction) return asCreateTripleAction.entityId

  let asDeleteTripleAction = action.asDeleteTripleAction()
  if (asDeleteTripleAction) return asDeleteTripleAction.entityId

  let asCreateEntityAction = action.asCreateEntityAction()
  if (asCreateEntityAction) return asCreateEntityAction.entityId

  return null
}

function handleRoot(
  root: Root,
  space: string,
  createdAtBlock: BigInt,
  createdBy: Address,
  createdAtTimestamp: BigInt
): void {
  const proposalId = getOrCreateActionCount().count.toString()

  // HACK: Right now the Root JSON parser returns '' for the same
  // if it does not exist in the object during parsing. Ideally
  // it should return null since that better represents the absence
  // of the name property.
  let proposalName = ''
  if (root.name != '') {
    proposalName = root.name
  }

  // create a proposal entity
  getOrCreateProposal(
    proposalId,
    createdBy,
    createdAtTimestamp,
    space,
    proposalName,
    createdAtBlock
  )

  // entityId -> actions
  let actionsByEntity: Map<string, Action[]> = new Map()

  for (let i = 0; i < root.actions.length; i++) {
    const action = root.actions[i]
    let entityId = getEntityId(action)
    if (entityId) {
      //let actions = actionsByEntity.get(entityId)
      const isSet = actionsByEntity.has(entityId)
      if (isSet) {
        const actions = actionsByEntity.get(entityId)
        actionsByEntity.set(entityId, actions.concat([action]))
      } else {
        actionsByEntity.set(entityId, [action])
      }
    }
  }

  // handle each entity's actions
  let entityIds = actionsByEntity.keys()

  for (let i = 0; i < entityIds.length; i++) {
    let entityId = entityIds[i]

    if (actionsByEntity.has(entityId) == false) continue
    let actions = actionsByEntity.get(entityId)
    let actionIds: string[] = []

    if (actions) {
      for (let j = 0; j < actions.length; j++) {
        const action = actions[j]
        let actionId = handleAction(action, space, createdAtBlock)
        if (actionId) actionIds = actionIds.concat([actionId])
      }
    }

    let proposedVersion = createProposedVersion(
      getOrCreateActionCount().count.toString(),
      createdAtTimestamp,
      actionIds,
      entityId,
      createdBy,
      proposalId,
      proposalName,
      createdAtBlock
    )

    createVersion(
      entityId + '-' + getOrCreateActionCount().count.toString(),
      proposedVersion.id,
      createdAtTimestamp,
      entityId,
      createdBy,
      proposalName,
      createdAtBlock
    )
  }
}
