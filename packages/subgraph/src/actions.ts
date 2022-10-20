import {
  Action,
  CreateEntityAction,
  CreateTripleAction,
  DeleteTripleAction,
} from '@geogenesis/action-schema/assembly'
import { Address, BigDecimal, log, store } from '@graphprotocol/graph-ts'
import { GeoEntity, Space, Triple } from '../generated/schema'
import { Log } from '../generated/templates'
import { bootstrap } from './bootstrap'
import { createTripleId } from './id'

export function handleSpaceAdded(spaceAddress: string): void {
  let space = new Space(spaceAddress)

  space.admins = []
  space.editors = []
  space.save()

  Log.create(Address.fromBytes(Address.fromHexString(spaceAddress)))
  bootstrap(space.id)
}

export function handleCreateTripleAction(
  fact: CreateTripleAction,
  space: string,
  isProtected: boolean
): void {
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
    triple.stringValue = stringValue.value
    triple.valueType = 'STRING'

    if (attribute.id == 'name') {
      entity.name = stringValue.value
      entity.save()
    }

    if (attribute.id == 'space') {
      handleSpaceAdded(stringValue.value)
    }
  }

  const numberValue = fact.value.asNumberValue()
  if (numberValue) {
    triple.numberValue = BigDecimal.fromString(numberValue.value)
    triple.valueType = 'NUMBER'
  }

  const entityValue = fact.value.asEntityValue()
  if (entityValue) {
    triple.entityValue = entityValue.value
    triple.valueType = 'ENTITY'
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

export function handleAction(action: Action, space: string): void {
  const createTripleAction = action.asCreateTripleAction()
  if (createTripleAction) {
    handleCreateTripleAction(createTripleAction, space, false)
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
