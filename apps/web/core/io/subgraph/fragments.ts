import { SYSTEM_IDS } from '@geogenesis/sdk';

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

/**
 * The relations fragment fetches the type of the relation and the from and to entities.
 * The to entity also includes any triples that could be used to represent an image entity.
 */
export const relationFragment = `
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

    triples(filter: {valueType: {equalTo: URI}, attributeId: {equalTo: "${SYSTEM_IDS.IMAGE_URL_ATTRIBUTE}}"}}) {
      nodes {
        ${imageValueTypeTripleFragment}
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
    types {
      nodes {
        id
        name
      }
    }
    name
  }
  numberValue
  textValue
  valueType
  space {
    id
  }
`;

export const resultTripleFragment = `
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
    types {
      nodes {
        id
        name
      }
    }
    name
  }
  numberValue
  textValue
  valueType
  space {
    id
    spacesMetadata {
      nodes {
        entity {
          id
          name
          types {
            nodes {
              id
              name
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
  types {
    nodes {
      id
      name
    }
  }
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

export const resultEntityFragment = `
  id
  name
  triples(filter: { attributeId: { equalTo: "a126ca530c8e48d5b88882c734c38935" } }) {
    nodes {
      ${resultTripleFragment}
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
