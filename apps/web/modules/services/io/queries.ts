export const proposedVersionsQuery = (entityId: string) => `query {
  proposedVersions(where: {entity: ${JSON.stringify(entityId)}}, first: 10, orderBy: createdAt, orderDirection: desc) {
    id
    name
    createdAt
    createdBy {
      id
    }
    actions {
      actionType
      id
      attribute {
        id
        name
      }
      entity {
        id
        name
      }
      entityValue {
        id
        name
      }
      numberValue
      stringValue
      valueType
      valueId
    }
  }
}`;

export const profileQuery = (address: string) => `query {
  geoEntities(where: {name_starts_with_nocase: ${JSON.stringify(address)}}) {
    id
    name
    entityOf {
      id
      stringValue
      valueId
      valueType
      numberValue
      space {
        id
      }
      entityValue {
        id
        name
      }
      attribute {
        id
        name
      }
      entity {
        id
        name
      }
    }
  }
}`;
