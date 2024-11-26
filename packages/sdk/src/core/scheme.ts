type GraphUri = `graph://${string}`;

type SchemeQueryParams = {
  spaceId?: string;
  versionId?: string;
};

export function fromEntityId(entityId: string, params: SchemeQueryParams = {}): GraphUri {
  if (isValid(entityId)) {
    throw new Error('The passed in entityId should not start with graph://');
  }

  let uri: GraphUri = `graph://${entityId}`;

  if (params.spaceId) {
    uri = `${uri}?s=${params.spaceId}`;
  }

  return uri;
}

export function isValid(value: string): value is GraphUri {
  return value.startsWith('graph://');
}

export function toEntityId(uri: GraphUri): string {
  const entity = uri.split('graph://')?.[1]?.split('?')[0];

  if (!entity) {
    throw new Error(`Could not parse entity id from provided URI: ${uri}`);
  }

  return entity;
}
