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
export const relationFragmentHistorical = `
  id
  spaceId
  entityId
  index
  typeOfVersion {
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

export const relationFragmentLive = `
  id
  spaceId
  entityId
  index
  typeOf {
    currentVersion {
      version {
        id
        name
        entityId
      }
    }
  }
  fromEntity {
    currentVersion {
      version {
        id
        name
        entityId
      }
    }
  }
  toEntity {
    currentVersion {
      version {
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
    }
  }`;

export const spacePluginsFragment = `
  daoAddress
  mainVotingPluginAddress
  memberAccessPluginAddress
  personalSpaceAdminPluginAddress
  spacePluginAddress
`;

/**
 * We distinguish between entities as they exist in the "live" knowledge graph and entities as they
 * exist at a specific point in history.
 *
 * Depending on the usecase we might filter relations by the live state of the KG or return relations
 * as they exist at the time the specific version was created.
 */
export const getEntityFragment = ({ spaceId, useHistorical }: { spaceId?: string; useHistorical?: boolean } = {}) => {
  const relationsFragment = useHistorical ? relationFragmentHistorical : relationFragmentLive;

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
          ${relationsFragment}
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
          ${relationsFragment}
        }
      }
      triples {
        nodes {
          ${tripleFragment}
        }
      }
    `;
};

export const spaceMetadataFragment = `
  spacesMetadatum {
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
          ${relationFragmentLive}
        }
      }
      triples {
        nodes {
          ${tripleFragment}
        }
      }
    }
  }
`;

export const getSpaceMetadataFragment = (spaceId?: string) => {
  if (spaceId) {
    return `
      spacesMetadatum {
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
          relationsByFromVersionId(filter: {spaceId: {equalTo: "${spaceId}"}}) {
            nodes {
              ${relationFragmentLive}
            }
          }
          triples(filter: {spaceId: {equalTo: "${spaceId}"}}) {
            nodes {
              ${tripleFragment}
            }
          }
        }
      }
    `;
  }

  return `
    spacesMetadatum {
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
            ${relationFragmentLive}
          }
        }
        triples {
          nodes {
            ${tripleFragment}
          }
        }
      }
    }
  `;
};

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

export const getSpaceFragment = (spaceId: string) => {
  if (spaceId) {
    return `
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
      ${getSpaceMetadataFragment(spaceId)}
    `;
  }

  return `
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
};

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
