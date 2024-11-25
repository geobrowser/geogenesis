type GraphUri = `graph://${string}`

export function fromEntityId(entityId: string, spaceId?: string): GraphUri {
  if (isGraphUrl(entityId)) {
    throw new Error("The passed in entityId should not start with graph://")
  }

  let uri: GraphUri = `graph://${entityId}`

  if (spaceId) {
    uri = `${uri}?s=${spaceId}`
  }

  return uri
}

export function isGraphUrl(value: string): value is GraphUri {
  return value.startsWith('graph://')
}

export function toEntityId(uri: GraphUri): string {
  const entity = uri.split('graph://')?.[1]?.split('?')[0]

  if (!entity) {
    throw new Error(`Could not parse entity id from provided URI: ${uri}`)
  }

  return entity
}
