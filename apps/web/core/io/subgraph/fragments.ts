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
  attributeVersion {
    entityId
    name
  }
  version {
    entityId
    name
  }
  numberValue
  textValue
  booleanValue
  valueType
  spaceId
`;

/**
 * The relations fragment fetches the type of the relation and the from and to entities.
 * The to entity also includes any triples that could be used to represent an image entity.
 */
export const relationFragment = `
  id
  spaceId
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
  }

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
  spacesMetadata(
    first: 1
    orderBy: VERSION_BY_VERSION_ID__CREATED_AT_DESC
    filter: {
      version: {
        edit: { proposals: { some: { status: { equalTo: ACCEPTED } } } }
      }
    }) {
    nodes {
      version {
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
      }
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
  ${spaceMetadataFragment}
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
