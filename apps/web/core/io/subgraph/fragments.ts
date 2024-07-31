export const imageValueTypeTripleFragment = `
    attributeId
    textValue
    valueType
`;

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
    triples {
      nodes {
        ${imageValueTypeTripleFragment}
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
  triples(filter: {isStale: {equalTo: false}}) {
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
