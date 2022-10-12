import {
  Action,
  CreateEntityAction,
  CreateTripleAction,
  DeleteTripleAction,
} from '@geogenesis/action-schema/assembly'
import { BigDecimal, log, store } from '@graphprotocol/graph-ts'
import { GeoEntity, Triple } from '../generated/schema'
import { createTripleId } from './id'

export function handleCreateTripleAction(
  fact: CreateTripleAction,
  isProtected: boolean
): void {
  const entity = (GeoEntity.load(fact.entityId) ||
    new GeoEntity(fact.entityId))!
  entity.save()

  const attribute = (GeoEntity.load(fact.attributeId) ||
    new GeoEntity(fact.attributeId))!
  attribute.save()

  const tripleId = createTripleId(fact.entityId, fact.attributeId, fact.value)

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

  const stringValue = fact.value.asStringValue()
  if (stringValue) {
    triple.stringValue = stringValue.value
    triple.valueType = 'STRING'

    if (attribute.id == 'name') {
      entity.name = stringValue.value
      entity.save()
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

function handleDeleteTripleAction(fact: DeleteTripleAction): void {
  const tripleId = createTripleId(fact.entityId, fact.attributeId, fact.value)

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

export function handleAction(action: Action): void {
  const createTripleAction = action.asCreateTripleAction()
  if (createTripleAction) {
    handleCreateTripleAction(createTripleAction, false)
    return
  }

  const deleteTripleAction = action.asDeleteTripleAction()
  if (deleteTripleAction) {
    handleDeleteTripleAction(deleteTripleAction)
    return
  }

  const createEntityAction = action.asCreateEntityAction()
  if (createEntityAction) {
    handleCreateEntityAction(createEntityAction)
    return
  }

  log.debug(`Unhandled action '${action.type}'`, [])
}
