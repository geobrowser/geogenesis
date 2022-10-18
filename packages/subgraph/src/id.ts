import { Value } from '@geogenesis/action-schema/assembly'

function createValueId(value: Value): string {
  const stringValue = value.asStringValue()
  if (stringValue) return `s~${stringValue.value}`

  const numberValue = value.asNumberValue()
  if (numberValue) return `n~${numberValue.value}`

  const entityValue = value.asEntityValue()
  if (entityValue) return `e~${entityValue.value}`

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
