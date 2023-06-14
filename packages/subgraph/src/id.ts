import { Value } from '@geogenesis/action-schema/assembly'

function createValueId(value: Value): string {
  const imageValue = value.asImageValue()
  if (imageValue) return imageValue.id

  const stringValue = value.asStringValue()
  if (stringValue) return stringValue.id

  const numberValue = value.asNumberValue()
  if (numberValue) return numberValue.id

  const entityValue = value.asEntityValue()
  if (entityValue) return entityValue.id

  const dateValue = value.asDateValue()
  if (dateValue) return dateValue.id

  throw new Error('Bad serialization')
}

export function createTripleId(
  spaceId: string,
  entityId: string,
  attributeId: string,
  value: Value
): string {
  return `${spaceId}:${entityId}:${attributeId}:${createValueId(value)}`
}
