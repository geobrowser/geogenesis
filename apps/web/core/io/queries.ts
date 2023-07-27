export const entitiesQuery = (
  query: string | undefined,
  entityOfWhere: string,
  typeIds?: string[],
  first = 100,
  skip = 0
) => {
  const typeIdsString =
    typeIds && typeIds.length > 0 ? `typeIds_contains_nocase: [${typeIds?.map(t => `"${t}"`).join(', ')}]` : '';

  const constructedWhere = {
    start: `{name_starts_with_nocase: ${JSON.stringify(query)}, entityOf_: {${entityOfWhere}}, ${typeIdsString}}`,
    contain: `{name_contains_nocase: ${JSON.stringify(query)}, entityOf_: {${entityOfWhere}}, ${typeIdsString}}`,
  };

  // If there are multiple TypeIds we need to build an OR query for each one. Each query in the OR
  // filter will contain the `query` and `entityOfWhere` params. We need to do this because there is
  // no where filter like "typeIds_contains_any_nocase."
  if (typeIds && typeIds.length > 1) {
    const whereStartsWithMultipleTypeIds = [];
    const whereContainsMultipleTypeIds = [];

    for (const id of typeIds) {
      whereStartsWithMultipleTypeIds.push(
        `typeIds_contains_nocase: ["${id}"], name_starts_with_nocase: ${JSON.stringify(
          query
        )}, entityOf_: {${entityOfWhere}}`
      );

      whereContainsMultipleTypeIds.push(
        `typeIds_contains_nocase: ["${id}"], name_contains_nocase: ${JSON.stringify(
          query
        )}, entityOf_: {${entityOfWhere}}`
      );
    }

    const multiFilterStartsWithQuery = whereStartsWithMultipleTypeIds.map(f => `{${f}}`).join(', ');
    const multiFilterContainsQuery = whereContainsMultipleTypeIds.map(f => `{${f}}`).join(', ');

    constructedWhere.start = `{or: [${multiFilterStartsWithQuery}]}`;
    constructedWhere.contain = `{or: [${multiFilterContainsQuery}]}`;
  }

  return `query {
    startEntities: geoEntities(where: ${constructedWhere.start}, first: ${first}, skip: ${skip}) {
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
    containEntities: geoEntities(where: ${constructedWhere.contain}, first: ${first}, skip: ${skip}) {
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
    geoEntities(where: ${filter}, first: ${first}, skip: ${skip}) {
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

export const proposalsQuery = (spaceId: string, skip = 0) => `query {
  proposals(first: 10, where: {space: ${JSON.stringify(
    spaceId
  )}}, orderBy: createdAt, orderDirection: desc, skip: ${skip}) {
    id
    name
    description
    createdAt
    createdAtBlock
    createdBy {
      id
    }
    status
    proposedVersions {
      id
      name
      createdAt
      createdAtBlock
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

export const proposedVersionsQuery = (entityId: string, skip = 0) => `query {
  proposedVersions(where: {entity: ${JSON.stringify(
    entityId
  )}}, orderBy: createdAt, orderDirection: desc, first: 10, skip: ${skip}) {
    id
    name
    createdAt
    createdAtBlock
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
    entity {
      id
      name
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

export const proposedVersionQuery = (id: string) => `query {
  proposedVersion(id: ${JSON.stringify(id)}) {
    id
    name
    createdAt
    createdAtBlock
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
    entity {
      id
      name
    }
  }
}`;

export const proposalQuery = (id: string) => `query {
  proposal(id: ${JSON.stringify(id)}) {
    id
    name
    description
    createdAt
    createdAtBlock
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
