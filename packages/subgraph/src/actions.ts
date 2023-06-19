import {
  Action,
  CreateEntityAction,
  CreateTripleAction,
  DeleteTripleAction,
} from '@geogenesis/action-schema/assembly'
import { NAME, SPACE, TYPES } from '@geogenesis/ids/system-ids'
import {
  Address,
  BigDecimal,
  BigInt,
  log,
  store,
} from '@graphprotocol/graph-ts'
import {
  GeoEntity,
  Space,
  Triple,
  Version,
  ProposedVersion,
  Account,
  Action as ActionEntity,
  ActionCount,
  Proposal,
} from '../generated/schema'
import { Space as SpaceDataSource } from '../generated/templates'
import { createTripleId } from './id'

export function handleSpaceAdded(
  spaceAddress: string,
  isRootSpace: boolean,
  createdAtBlock: BigInt,
  entityId: string | null
): void {
  if (spaceAddress.length != 42) {
    log.debug(`Invalid space address: ${spaceAddress}`, [])
    return
  }

  log.debug(`Adding space: ${spaceAddress}`, [])
  let space = new Space(spaceAddress)

  space.admins = []
  space.editors = []
  space.editorControllers = []
  space.isRootSpace = isRootSpace
  space.createdAtBlock = createdAtBlock
  space.entity = entityId

  space.save()

  SpaceDataSource.create(Address.fromBytes(Address.fromHexString(spaceAddress)))
}

class HandleCreateTripleActionOptions {
  fact: CreateTripleAction
  space: string
  isProtected: boolean
  createdAtBlock: BigInt
}

function addEntityTypeId(entity: GeoEntity, valueId: string): void {
  log.debug(`Adding type ID ${valueId} to entity ${entity.id}`, [])
  entity.typeIds = entity.typeIds.concat([valueId])
  entity.save()
}

function removeEntityTypeId(entity: GeoEntity, valueId: string): void {
  log.debug(`Removing type ID ${valueId} from entity ${entity.id}`, [])
  let typeIds: string[] = []
  for (let i = 0; i < entity.typeIds.length; i++) {
    if (entity.typeIds[i] != valueId) {
      typeIds.push(entity.typeIds[i])
    }
  }
  entity.typeIds = typeIds
  entity.save()
}

export function getOrCreateEntity(id: string): GeoEntity {
  let entity = GeoEntity.load(id)
  if (entity == null) {
    entity = new GeoEntity(id)
    entity.typeIds = []
    entity.versions = []
    entity.save()
  }
  return entity
}

export function createProposedVersion(
  versionId: string,
  createdAt: BigInt,
  actions: string[],
  entityId: string,
  createdBy: Address,
  proposalId: string,
  proposalName: string | null,
  createdAtBlock: BigInt
): ProposedVersion {
  let version = ProposedVersion.load(versionId)
  if (version == null) {
    version = new ProposedVersion(versionId)
    version.createdBy = getOrCreateAccount(createdBy).id
    version.actions = actions // action ids
    version.entity = entityId
    version.createdAt = createdAt
    version.name = proposalName
    version.createdAtBlock = createdAtBlock
    version.save()
  }
  let proposal = Proposal.load(proposalId)
  if (proposal != null) {
    proposal.proposedVersions = proposal.proposedVersions.concat([versionId])
    proposal.save()
  }
  return version
}

export function getOrCreateAccount(address: Address): Account {
  let account = Account.load(address.toHexString())
  if (account == null) {
    account = new Account(address.toHexString())
    account.save()
  }
  return account
}

export function createVersion(
  versionId: string,
  proposedVersion: string,
  createdAt: BigInt,
  entityId: string,
  createdBy: Address,
  proposalName: string | null,
  createdAtBlock: BigInt
): Version {
  let version = Version.load(versionId)
  let proposed = ProposedVersion.load(proposedVersion)
  let entity = getOrCreateEntity(entityId)
  if (version == null) {
    version = new Version(versionId)
    version.createdBy = getOrCreateAccount(createdBy).id
    if (entity != null) {
      if (entity.versions.length == 0 && proposed != null) {
        version.proposedVersion = proposed.id
        version.actions = proposed.actions
      } else if (entity.versions.length > 0 && proposed != null) {
        let lastVersion = Version.load(
          entity.versions[entity.versions.length - 1]
        )
        if (lastVersion != null) {
          version.actions = lastVersion.actions.concat(proposed.actions)
          version.proposedVersion = proposed.id
        }
      } else {
        log.debug(`No proposed version found for ${versionId}`, [])
        version.actions = []
      }
      entity.version = version.id
      entity.versions = entity.versions.concat([version.id])
      entity.save()
    }
    version.createdAt = createdAt
    version.name = proposalName
    version.createdAtBlock = createdAtBlock
    version.save()
  }
  return version
}

export function handleCreateTripleAction(
  options: HandleCreateTripleActionOptions
): void {
  const fact = options.fact
  const space = options.space
  const isProtected = options.isProtected
  const createdAtBlock = options.createdAtBlock

  const entity = getOrCreateEntity(fact.entityId)
  entity.save()

  const attribute = getOrCreateEntity(fact.attributeId)
  attribute.save()

  const tripleId = createTripleId(
    space,
    fact.entityId,
    fact.attributeId,
    fact.value
  )

  const existing = Triple.load(tripleId)

  // Normally we silently allow creating an identical triple that already exists.
  // However, we don't want to accidentally change the protected status of a triple.
  // There are other ways we could do this, but considering it an error and failing
  // here seems simplest, and will also prevent accidental updates if we have
  // updatable fields in the future.
  if (existing && existing.isProtected) {
    log.debug(
      `Couldn't create or update triple '${tripleId}' since it already exists and is protected!`,
      []
    )
    return
  }

  const triple = (existing || new Triple(tripleId))!
  triple.isProtected = isProtected
  triple.entity = entity.id

  triple.attribute = attribute.id
  //NOTE: Maybe delete this
  triple.valueType = fact.value.type.toUpperCase()
  triple.space = space

  const dateValue = fact.value.asDateValue()
  if (dateValue) {
    log.debug('Creating date value', [])
    if (attribute.id == TYPES) {
      addEntityTypeId(entity, dateValue.value)
    }
    triple.valueType = 'DATE'
    triple.valueId = dateValue.id
    triple.stringValue = dateValue.value
    log.debug('Finished creating date value', [])
  }

  const stringValue = fact.value.asStringValue()
  if (stringValue) {
    if (attribute.id == TYPES) {
      addEntityTypeId(entity, stringValue.id)
    }
    triple.valueType = 'STRING'
    triple.valueId = stringValue.id
    triple.stringValue = stringValue.value

    if (attribute.id == NAME) {
      entity.name = stringValue.value
      entity.save()
    }

    log.debug(
      `space: ${space}, entityId: ${entity.id}, attributeId: ${attribute.id}, value: ${stringValue.value}`,
      []
    )

    if (attribute.id == SPACE) {
      handleSpaceAdded(stringValue.value, false, createdAtBlock, fact.entityId)
    }
  }

  const imageValue = fact.value.asImageValue()
  if (imageValue) {
    triple.valueType = 'IMAGE'
    triple.valueId = imageValue.id
    triple.stringValue = imageValue.value

    log.debug(
      `space: ${space}, entityId: ${entity.id}, attributeId: ${attribute.id}, value: ${imageValue.value}`,
      []
    )
  }

  const numberValue = fact.value.asNumberValue()
  if (numberValue) {
    if (attribute.id == TYPES) {
      addEntityTypeId(entity, numberValue.id)
    }
    triple.valueType = 'NUMBER'
    triple.valueId = numberValue.id
    triple.numberValue = BigDecimal.fromString(numberValue.value)
  }

  const entityValue = fact.value.asEntityValue()
  if (entityValue) {
    if (attribute.id == TYPES) {
      addEntityTypeId(entity, entityValue.id)
    }
    triple.valueType = 'ENTITY'
    triple.valueId = entityValue.id
    triple.entityValue = entityValue.id
  }

  triple.save()

  log.debug(`ACTION: Created triple: ${triple.id}`, [])
}

export function getOrCreateActionCount(): ActionCount {
  let actionCount = ActionCount.load('1')
  if (actionCount == null) {
    actionCount = new ActionCount('1')
    actionCount.count = BigInt.fromI32(0)
  }
  actionCount.count = actionCount.count.plus(BigInt.fromI32(1))
  actionCount.save()
  return actionCount
}

function handleDeleteTripleAction(
  fact: DeleteTripleAction,
  space: string
): void {
  const tripleId = createTripleId(
    space,
    fact.entityId,
    fact.attributeId,
    fact.value
  )

  const triple = Triple.load(tripleId)

  if (triple && triple.isProtected) {
    log.debug(`Couldn't delete triple '${tripleId}' since it's protected'!`, [])
    return
  }

  if (fact.attributeId == TYPES) {
    const entity = getOrCreateEntity(fact.entityId)
    const stringValue = fact.value.asStringValue()

    if (stringValue && entity) {
      removeEntityTypeId(entity, stringValue.id)
    }

    const numberValue = fact.value.asNumberValue()
    if (numberValue && entity) {
      removeEntityTypeId(entity, numberValue.id)
    }

    const entityValue = fact.value.asEntityValue()
    if (entityValue && entity) {
      removeEntityTypeId(entity, entityValue.id)
    }

    // const dateValue = fact.value.asDateValue()
    // if (dateValue && entity) {
    //   removeEntityTypeId(entity, dateValue.value)
    // }
  }

  if (fact.attributeId == 'name') {
    const entity = getOrCreateEntity(fact.entityId)

    // Doesn't handle the situation where there's multiple name triples for a single entity
    if (entity) {
      entity.name = null
      entity.save()
    }
  }

  store.remove('Triple', tripleId)

  log.debug(`ACTION: Deleted triple: ${tripleId}`, [])
}

export function handleCreateEntityAction(action: CreateEntityAction): void {
  const entity = getOrCreateEntity(action.entityId)
  entity.save()

  log.debug(`ACTION: Created entity: ${entity.id}`, [])
}

export function getOrCreateAction(
  id: string,
  actionType: string,
  entityId: string,
  attributeId: string | null = null,
  valueType: string | null = null,
  valueId: string | null = null,
  numberValue: string | null = null,
  stringValue: string | null = null,
  entityValue: string | null = null,
  imageValue: string | null = null,
  dateValue: string | null = null
): ActionEntity {
  let action = ActionEntity.load(id)
  if (action == null) {
    action = new ActionEntity(id)
    action.actionType = actionType
    action.entity = entityId
    if (attributeId) action.attribute = attributeId
    if (valueType) action.valueType = valueType
    if (valueId) action.valueId = valueId
    if (numberValue) action.numberValue = BigDecimal.fromString(numberValue)
    if (stringValue) action.stringValue = stringValue
    if (entityValue) action.entityValue = entityValue
    if (imageValue) action.stringValue = imageValue
    if (dateValue) action.stringValue = dateValue

    action.save()
  }

  return action
}

export function handleAction(
  action: Action,
  space: string,
  createdAtBlock: BigInt
): string | null {
  // ~~~~~~~~~~~~~~~~~~~~
  // CREATE TRIPLE ACTION
  // ~~~~~~~~~~~~~~~~~~~~
  const createTripleAction = action.asCreateTripleAction()
  if (createTripleAction) {
    handleCreateTripleAction({
      fact: createTripleAction,
      space,
      isProtected: false,
      createdAtBlock,
    })
    let entityId = createTripleAction.entityId
    let actionId = getOrCreateActionCount().count.toString()
    let attributeId = createTripleAction.attributeId
    let value = createTripleAction.value
    let valueId: string = ''

    let imageValue = value.asDateValue()
    let imgValue: string | null = null
    if (imageValue != null) {
      valueId = imageValue.id
      imgValue = imageValue.value
    }

    let dateValue = value.asDateValue()
    let dValue: string | null = null
    if (dateValue != null) {
      valueId = dateValue.id
      dValue = dateValue.value
    }

    let entityValue = value.asEntityValue()
    let entValue: string | null = null
    if (entityValue != null) {
      valueId = entityValue.id
      entValue = entityValue.id
    }
    let stringValue = value.asStringValue()
    let strValue: string | null = null
    if (stringValue != null) {
      valueId = stringValue.id
      strValue = stringValue.value
    }
    let numberValue = value.asNumberValue()
    let numValue: string | null = null
    if (numberValue != null) {
      valueId = numberValue.id
      numValue = numberValue.value
    }
    let action = getOrCreateAction(
      actionId,
      'CREATE',
      entityId,
      attributeId,
      value.type.toUpperCase(),
      valueId,
      numValue,
      strValue,
      entValue,
      imgValue,
      dValue
    )
    return action.id
  }

  // ~~~~~~~~~~~~~~~~~~~~
  // DELETE TRIPLE ACTION
  // ~~~~~~~~~~~~~~~~~~~~
  const deleteTripleAction = action.asDeleteTripleAction()
  if (deleteTripleAction) {
    handleDeleteTripleAction(deleteTripleAction, space)

    let entityId = deleteTripleAction.entityId
    getOrCreateEntity(entityId)
    let actionId = getOrCreateActionCount().count.toString()
    let attributeId = deleteTripleAction.attributeId
    let value = deleteTripleAction.value
    let valueId: string = ''

    let imageValue = value.asDateValue()
    let imgValue: string | null = null
    if (imageValue != null) {
      valueId = imageValue.id
      imgValue = imageValue.value
    }

    let dateValue = value.asDateValue()
    let dValue: string | null = null
    if (dateValue != null) {
      valueId = dateValue.id
      dValue = dateValue.value
    }

    let entityValue = value.asEntityValue()
    let entValue: string | null = null
    if (entityValue != null) {
      valueId = entityValue.id
      entValue = entityValue.id
    }
    let stringValue = value.asStringValue()
    let strValue: string | null = null
    if (stringValue != null) {
      valueId = stringValue.id
      strValue = stringValue.value
    }
    let numberValue = value.asNumberValue()
    let numValue: string | null = null
    if (numberValue != null) {
      valueId = numberValue.id
      numValue = numberValue.value
    }
    let action = getOrCreateAction(
      actionId,
      'DELETE',
      entityId,
      attributeId,
      value.type.toUpperCase(),
      valueId,
      numValue,
      strValue,
      entValue,
      imgValue,
      dValue
    )
    return action.id
  }

  // ~~~~~~~~~~~~~~~~~~~~
  // CREATE ENTITY ACTION
  // ~~~~~~~~~~~~~~~~~~~~
  const createEntityAction = action.asCreateEntityAction()
  if (createEntityAction) {
    handleCreateEntityAction(createEntityAction)

    let entityId = createEntityAction.entityId
    let actionId = getOrCreateActionCount().count.toString()

    let action = getOrCreateAction(actionId, 'CREATE', entityId)

    return action.id
  }

  return null

  log.debug(`Unhandled action '${action.type}'`, [])
}
