export const imageValueTypeTripleFragment = `
    attributeId
    textValue
    valueType
`;

/**
 * `
 *  entity {
 *    id
 *    name
 *    entityTypes {
 *      nodes {
 *        type {
 *          id
 *          name
 *        }
 *      }
 *    }
 *  }
 * `
 */
export const entityTypesFragment = `
  entityTypes {
    nodes {
      type {
        id
        name
      }
    }
  }
`;

export const tripleFragment = `
  attribute {
    id
    name
  }
  entityId
  entity {
    id
    name
  }
  entityValue {
    id
    name
    ${entityTypesFragment}
  }
  numberValue
  textValue
  valueType
  space {
    id
  }
`;

/**
 * The relations fragment fetches the type of the relation and the from and to entities.
 * The to entity also includes any triples that could be used to represent an image entity.
 */
export const relationFragment = `
  id
  index
  typeOf {
    id
    name
  }
  fromEntity {
    id
    name
  }
  toEntity {
    id
    name
    ${entityTypesFragment}
    triples {
      nodes {
        ${tripleFragment}
      }
    }
  }
`;

export const spacePluginsFragment = `
  daoAddress
  mainVotingPluginAddress
  memberAccessPluginAddress
  personalSpaceAdminPluginAddress
  spacePluginAddress
`;

export const entityFragment = `
  id
  name
  description
  ${entityTypesFragment}
  relationsByFromEntityId {
    nodes {
      ${relationFragment}
    }
  }
  triples {
    nodes {
      ${tripleFragment}
    }
  }
`;

export const spaceMetadataFragment = `
  id
  name
  triples(filter: {isStale: {equalTo: false}}) {
    nodes {
      ${tripleFragment}
    }
  }
`;

export const spaceFragment = `
  id
  type
  isRootSpace
  ${spacePluginsFragment}

  spaceEditors {
    nodes {
      accountId
    }
  }

  spaceMembers {
    nodes {
      accountId
    }
  }

  createdAtBlock

  spacesMetadata {
    nodes {
      entity {
        ${entityFragment}
      }
    }
  }
`;

export const resultEntityFragment = `
  id
  name
  description
  ${entityTypesFragment}
  entitySpaces {
    nodes {
      space {
        ${spaceFragment}
      }
    }
  }
`;
