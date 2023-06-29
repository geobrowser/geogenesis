import { Value } from '@geogenesis/action-schema/assembly'
import { log } from '@graphprotocol/graph-ts'

function createValueId(value: Value): string {
  const imageValue = value.asImageValue()
  if (imageValue) return imageValue.id

  const dateValue = value.asDateValue()
  if (dateValue) return dateValue.id

  const urlValue = value.asUrlValue()
  if (urlValue) return urlValue.id

  const stringValue = value.asStringValue()
  if (stringValue) return stringValue.id

  const numberValue = value.asNumberValue()
  if (numberValue) return numberValue.id

  const entityValue = value.asEntityValue()
  if (entityValue) return entityValue.id

  throw new Error('Bad serialization of value id in createValueId()')
}

export function createTripleId(
  spaceId: string,
  entityId: string,
  attributeId: string,
  value: Value
): string {
  let valueId = createValueId(value)
  log.debug(`entityId: ${entityId}`, [])
  log.debug(`attributeId: ${attributeId}`, [])
  log.debug(`valueId: ${valueId}`, [])
  return `${spaceId}:${entityId}:${attributeId}:${valueId}`
}
