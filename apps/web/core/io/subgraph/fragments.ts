import { SpaceId } from '~/core/types';

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
        entityId
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
  booleanValue
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
  entityId
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

export const getVersionFragment = (spaceId?: SpaceId) => {
  if (spaceId) {
    return `
      id
      entityId
      name
      description
      versionSpaces {
        nodes {
          spaceId
        }
      }
      ${versionTypesFragment}
      relationsByFromVersionId(filter: {spaceId: {equalTo: "${spaceId}"}}) {
        nodes {
          ${relationFragment}
        }
      }
      triples(filter: {spaceId: {equalTo: "${spaceId}"}}) {
        nodes {
          ${tripleFragment}
        }
      }
    `;
  } else {
    return `
      id
      entityId
      name
      description
      versionSpaces {
        nodes {
          spaceId
        }
      }
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
  }
};

export const versionFragment = `
  id
  entityId
  name
  description
  versionSpaces {
    nodes {
      spaceId
    }
  }
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
  versionSpaces {
    nodes {
      spaceId
    }
  }
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
      spaceId
      space {
        ${spaceFragment}
      }
    }
  }
`;
