export const entitiesQuery = (
  query: string | undefined,
  entityOfWhere: string,
  typeIds?: string[],
  first = 100,
  skip = 0
) => {
  const typeIdsString =
    typeIds && typeIds.length > 0 ? `typeIds_contains_nocase: [${typeIds?.map(t => `"${t}"`).join(', ')}]` : '';

  return `query {
    startEntities: geoEntities(where: {name_starts_with_nocase: ${JSON.stringify(
      query
    )}, entityOf_: {${entityOfWhere}}, ${typeIdsString}}, first: ${first}, skip: ${skip}) {
      id,
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
    containEntities: geoEntities(where: {name_contains_nocase: ${JSON.stringify(
      query
    )}, entityOf_: {${entityOfWhere}}, ${typeIdsString}}, first: ${first}, skip: ${skip}) {
      id,
      name,
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
};

// this differs from the fetchEntities method in that we pass in a custom graphql string that represents
// the set of custom Table filters set on the table. These filters have small differences from the other
// types of filters we have in the app, so we are using a separate method to fetch them for now.
//
// Ideally we let the caller define the logic for fetching and handling the result, but for now we are
// following the pre-existing pattern.
export const tableEntitiesQuery = (filter: string, first = 100, skip = 0) => {
  return `query {
    startEntities: geoEntities(where: ${filter}, first: ${first}, skip: ${skip}) {
      id,
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
};

export const proposalsQuery = (spaceId: string) => `query {
  proposals(first: 10, where: {space: ${JSON.stringify(spaceId)}}, orderBy: createdAt, orderDirection: desc) {
    id
    name
    description
    createdAt
    createdBy {
      id
    }
    status
    proposedVersions {
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
  }
}`;

export const proposedVersionsQuery = (entityId: string) => `query {
  proposedVersions(where: {entity: ${JSON.stringify(entityId)}}, orderBy: createdAt, orderDirection: desc, first: 10) {
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
