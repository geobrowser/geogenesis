import {
  Action,
  CreateEntityAction,
  CreateTripleAction,
  DeleteTripleAction,
} from '@geogenesis/action-schema/assembly'
import {
  Address,
  BigDecimal,
  BigInt,
  log,
  store,
} from '@graphprotocol/graph-ts'
import { GeoEntity, Space, Triple } from '../generated/schema'
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
  entity.typeIds = entity.typeIds.concat([valueId]);
  entity.save()
}

function removeEntityTypeId(entity: GeoEntity, valueId: string): void {
  log.debug(`Removing type ID ${valueId} from entity ${entity.id}`, [])
  let typeIds: string[] = [];
  for (let i = 0; i < entity.typeIds.length; i++) {
    if (entity.typeIds[i] != valueId) {
      typeIds.push(entity.typeIds[i])
    }
  }
  entity.typeIds = typeIds;
  entity.save()
}


export function getOrCreateEntity(id: string): GeoEntity {
  let entity = GeoEntity.load(id)
  if (entity == null) {
    entity = new GeoEntity(id)
    entity.typeIds = []
    entity.save()
  }
  return entity
}

export function handleCreateTripleAction(
  options: HandleCreateTripleActionOptions
): void {
  const fact = options.fact
  const space = options.space
  const isProtected = options.isProtected
  const createdAtBlock = options.createdAtBlock

  const entity = getOrCreateEntity(fact.entityId);
  entity.save()

  const attribute = getOrCreateEntity(fact.attributeId);
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
  triple.valueType = fact.value.type
  triple.space = space

  const stringValue = fact.value.asStringValue()
  if (stringValue) {
    if(attribute.id == 'type') {
      addEntityTypeId(entity, stringValue.id);
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
    if(attribute.id == 'type') {
      addEntityTypeId(entity, numberValue.id);
    }
    triple.valueType = 'NUMBER'
    triple.valueId = numberValue.id
    triple.numberValue = BigDecimal.fromString(numberValue.value)
  }

  const entityValue = fact.value.asEntityValue()
  if (entityValue) {
    if(attribute.id == 'type') {
      addEntityTypeId(entity, entityValue.id);
    }
    triple.valueType = 'ENTITY'
    triple.valueId = entityValue.id
    triple.entityValue = entityValue.id
  }

  triple.save()

  log.debug(`ACTION: Created triple: ${triple.id}`, [])
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
  fact.type

  const triple = Triple.load(tripleId)

  if (triple && triple.isProtected) {
    log.debug(`Couldn't delete triple '${tripleId}' since it's protected'!`, [])
    return
  }

  if (fact.attributeId == 'type') {
    const entity = GeoEntity.load(fact.entityId)
    const stringValue = fact.value.asStringValue()
    if (stringValue && entity) {
      removeEntityTypeId(entity, stringValue.id);
    }

    const numberValue = fact.value.asNumberValue()
    if (numberValue && entity) {
      removeEntityTypeId(entity, numberValue.id);
    }

    const entityValue = fact.value.asEntityValue()
    if (entityValue && entity) {
      removeEntityTypeId(entity, entityValue.id);
    }
  }


  if (fact.attributeId == 'name') {
    const entity = GeoEntity.load(fact.entityId)

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
  entity.typeIds = [];
  entity.save()

  log.debug(`ACTION: Created entity: ${entity.id}`, [])
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
    return
  }

  const deleteTripleAction = action.asDeleteTripleAction()
  if (deleteTripleAction) {
    handleDeleteTripleAction(deleteTripleAction, space)
    return
  }

  const createEntityAction = action.asCreateEntityAction()
  if (createEntityAction) {
    handleCreateEntityAction(createEntityAction)
    return
  }

  log.debug(`Unhandled action '${action.type}'`, [])
}
