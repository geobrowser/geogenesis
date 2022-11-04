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
import { bootstrap } from './bootstrap'
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
  space.isRootSpace = isRootSpace
  space.createdAtBlock = createdAtBlock
  space.entity = entityId

  space.save()

  SpaceDataSource.create(Address.fromBytes(Address.fromHexString(spaceAddress)))
  bootstrap(space.id, createdAtBlock)
}

class HandleCreateTripleActionOptions {
  fact: CreateTripleAction
  space: string
  isProtected: boolean
  createdAtBlock: BigInt
}

export function handleCreateTripleAction(
  options: HandleCreateTripleActionOptions
): void {
  const fact = options.fact
  const space = options.space
  const isProtected = options.isProtected
  const createdAtBlock = options.createdAtBlock

  const entity = (GeoEntity.load(fact.entityId) ||
    new GeoEntity(fact.entityId))!
  entity.save()

  const attribute = (GeoEntity.load(fact.attributeId) ||
    new GeoEntity(fact.attributeId))!
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
    triple.valueType = 'NUMBER'
    triple.valueId = numberValue.id
    triple.numberValue = BigDecimal.fromString(numberValue.value)
  }

  const entityValue = fact.value.asEntityValue()
  if (entityValue) {
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

  const triple = Triple.load(tripleId)

  if (triple && triple.isProtected) {
    log.debug(`Couldn't delete triple '${tripleId}' since it's protected'!`, [])
    return
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
  const entity = (GeoEntity.load(action.entityId) ||
    new GeoEntity(action.entityId))!

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
