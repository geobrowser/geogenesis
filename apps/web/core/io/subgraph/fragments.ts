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
    currentVersion {
      version {
        id
        name
      }
    }
  }
  entity {
    currentVersion {
      version {
        id
        name
      }
    }
  }
  entityValue {
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
  }
  fromVersion {
    id
    name
  }
  toVersion {
    id
    name
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
        ${versionFragment}
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
