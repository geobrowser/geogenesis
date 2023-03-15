import {
  Action,
  CreateEntityAction,
  CreateTripleAction,
  DeleteTripleAction,
} from '@geogenesis/action-schema/assembly'
import { TYPES } from '@geogenesis/ids/system-ids'
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

function createProposedVersion(
  versionId: string, //entityId + createdAtBlock
  //creator: string = 'placeholder',
  createdAt: BigInt,
  actions: string[],
  entityId: string
): ProposedVersion {
  let version = ProposedVersion.load(versionId)
  // if someone is creating a version
  // this should never be null
  //let account = Account.load(creator)
  if (version == null) {
    version = new ProposedVersion(versionId)
    //if (account != null) {
    //  version.author = account.id
    //}
    version.actions = actions // action ids
    version.entity = entityId
    version.createdAt = createdAt
    version.save()
  }
  return version
}

// NOTE: Add this back in VVV
// if someone is creating a version
// this should never be null;
//let account = Account.load(creator)
//if (account != null) {
// version.author = account.id
//}
function createVersion(
  versionId: string,
  //creator: string,
  proposedVersion: string,
  createdAt: BigInt,
  entityId: string
): Version {
  let version = Version.load(versionId)
  let proposed = ProposedVersion.load(proposedVersion)
  let entity = getOrCreateEntity(entityId)
  if (version == null) {
    version = new Version(versionId)
    if (entity != null) {
      if (entity.versions.length == 0 && proposed != null) {
        version.proposedVersion = proposed.id
        version.actions = proposed.actions
      } else if (proposed != null) {
        version.proposedVersion = proposed.id
        version.actions = proposed.actions.concat(version.actions)
      } else {
        log.debug(`No proposed version found for ${versionId}`, [])
        version.actions = []
      }
      entity.version = version.id
      entity.versions = entity.versions.concat([version.id])
      entity.save()
    }
    version.createdAt = createdAt
    version.save()
  }
  return version
}

export function handleCreateTripleAction(
  options: HandleCreateTripleActionOptions
): void {
  const fact = options.fact
  // NOTE: this is the action?
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

  const stringValue = fact.value.asStringValue()
  if (stringValue) {
    if (attribute.id == TYPES) {
      addEntityTypeId(entity, stringValue.id)
    }
    triple.valueType = 'STRING'
    triple.valueId = stringValue.id
    triple.stringValue = stringValue.value

    if (attribute.id == 'name') {
      entity.name = stringValue.value
      entity.save()
    }

    log.debug(
      `space: ${space}, entityId: ${entity.id}, attributeId: ${attribute.id}, value: ${stringValue.value}`,
      []
    )

    if (attribute.id == 'space') {
      handleSpaceAdded(stringValue.value, false, createdAtBlock, fact.entityId)
    }
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

function getOrCreateActionCount(): ActionCount {
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

function handleCreateEntityAction(action: CreateEntityAction): void {
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
  entityValue: string | null = null // entityId
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
    action.save()
  }

  return action
}

export function handleAction(
  action: Action,
  space: string,
  createdAtBlock: BigInt
): void {
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

    let entityValue = value.asEntityValue()
    let entValue: string | null = null
    if (entityValue != null) {
      valueId = entityValue.id
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
      entValue
    )
    let proposed = createProposedVersion(
      (entityId += '-' + getOrCreateActionCount().count.toString()),
      createdAtBlock,
      [action.id],
      entityId
    )
    let version = createVersion(
      (entityId += '-' + getOrCreateActionCount().count.toString()),
      proposed.id,
      createdAtBlock,
      entityId
    )
    return
  }

  const deleteTripleAction = action.asDeleteTripleAction()
  if (deleteTripleAction) {
    // TODO: getOrCreateVersion
    handleDeleteTripleAction(deleteTripleAction, space)

    let entityId = deleteTripleAction.entityId
    let actionId = getOrCreateActionCount().count.toString()
    let attributeId = deleteTripleAction.attributeId
    let value = deleteTripleAction.value
    let valueId: string = ''

    let entityValue = value.asEntityValue()
    let entValue: string | null = null
    if (entityValue != null) {
      valueId = entityValue.id
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
      entValue
    )
    let proposed = createProposedVersion(
      (entityId += '-' + getOrCreateActionCount().count.toString()),
      createdAtBlock,
      [action.id],
      entityId
    )
    let version = createVersion(
      (entityId += '-' + getOrCreateActionCount().count.toString()),
      proposed.id,
      createdAtBlock,
      entityId
    )
    return
  }

  const createEntityAction = action.asCreateEntityAction()
  if (createEntityAction) {
    handleCreateEntityAction(createEntityAction)

    let entityId = createEntityAction.entityId
    let actionId = getOrCreateActionCount().count.toString()
    let action = getOrCreateAction(actionId, 'CREATE', entityId)
    let proposed = createProposedVersion(
      (entityId += '-' + getOrCreateActionCount().count.toString()),
      createdAtBlock,
      [action.id],
      entityId
    )
    let version = createVersion(
      (entityId += '-' + getOrCreateActionCount().count.toString()),
      proposed.id,
      createdAtBlock,
      entityId
    )
    return
  }

  log.debug(`Unhandled action '${action.type}'`, [])
}
