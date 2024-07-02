export const imageValueTypeTripleFragment = `
    attributeId
    textValue
    valueType
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
  collectionValue {
    id
    collectionItems {
      nodes {
        index
        collectionItemEntityId
        entity {
          id
          name
          types {
            nodes {
              id
            }
          }
          triples {
            nodes {
              ${imageValueTypeTripleFragment}
            }
          }
        }
      }
    }
  }
  textValue
  valueType
  space {
    id
  }
`;

export const spacePluginsFragment = `
  mainVotingPluginAddress
  memberAccessPluginAddress
  personalSpaceAdminPluginAddress
  spacePluginAddress
`;

export const entityFragment = `
  id
  name
  types {
    nodes {
      id
      name
    }
  }
  triples(filter: {isStale: {equalTo: false}}) {
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

  createdAt

  metadata {
    nodes {
      ${entityFragment}
    }
  }
`;
