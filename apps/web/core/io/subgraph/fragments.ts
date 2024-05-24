export const tripleFragment = `
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
  collectionValue {
    id
    collectionItems {
      nodes {
        entity {
          id
          name
          types {
            nodes {
              id
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
  spacePluginAddress
`;

export const entityFragment = `
  id
  name
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
