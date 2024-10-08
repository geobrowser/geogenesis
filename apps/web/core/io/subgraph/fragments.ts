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
export const versionTypesFragment = `
  versionTypes {
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
    currentVersion {
      version {
        id
        name
      }
    }
  }
  entity {
    id
    currentVersion {
      version {
        id
        name
      }
    }
  }
  entityValue {
    id
    currentVersion {
      version {
        id
        name
        ${versionTypesFragment}
      }
    }
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
    entityId
  }
  fromVersion {
    id
    name
    entityId
  }
  toVersion {
    id
    name
    entityId
    ${versionTypesFragment}
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

export const versionFragment = `
  id
  name
  description
  ${versionTypesFragment}
  relationsByFromVersionId {
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
  description
  ${versionTypesFragment}
  relationsByFromVersionId {
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
        id
        currentVersion {
          version {
            ${versionFragment}
          }
        }
      }
    }
  }
`;

export const resultEntityFragment = `
  id
  name
  description
  ${versionTypesFragment}
  versionSpaces {
    nodes {
      space {
        ${spaceFragment}
      }
    }
  }
`;

export const opFragment = `
  id
  type
`;

export const proposedVersionFragment = `
  id
  entity {
    id
    name
  }
  ops {
    nodes {
      ${opFragment}
      ${tripleFragment}
      attributeId
      entityId
    }
  }
`;
