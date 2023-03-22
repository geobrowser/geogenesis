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
