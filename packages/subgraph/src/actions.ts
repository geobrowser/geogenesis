import {
  Action,
  CreateEntityAction,
  CreateTripleAction,
  DeleteTripleAction,
} from '@geogenesis/action-schema/assembly'
import { BigDecimal, log, store } from '@graphprotocol/graph-ts'
import { GeoEntity, Triple } from '../generated/schema'
import { createTripleId } from './id'

function handleCreateTripleAction(fact: CreateTripleAction): void {
  const entity = (GeoEntity.load(fact.entityId) ||
    new GeoEntity(fact.entityId))!
  entity.save()

  const attribute = (GeoEntity.load(fact.attributeId) ||
    new GeoEntity(fact.attributeId))!
  attribute.save()

  const tripleId = createTripleId(fact.entityId, fact.attributeId, fact.value)

  const triple = (Triple.load(tripleId) || new Triple(tripleId))!
  triple.entity = entity.id
  triple.attribute = attribute.id
  triple.valueType = fact.value.type

  const stringValue = fact.value.asStringValue()
  if (stringValue) {
    triple.stringValue = stringValue.value
    triple.valueType = 'STRING'
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
}

function handleDeleteTripleAction(fact: DeleteTripleAction): void {
  const tripleId = createTripleId(fact.entityId, fact.attributeId, fact.value)

  store.remove('Triple', tripleId)
}

function handleCreateEntityAction(action: CreateEntityAction): void {
  const entity = (GeoEntity.load(action.entityId) ||
    new GeoEntity(action.entityId))!
  entity.save()
}

export function handleAction(action: Action): void {
  const createTripleAction = action.asCreateTripleAction()
  if (createTripleAction) {
    handleCreateTripleAction(createTripleAction)
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
