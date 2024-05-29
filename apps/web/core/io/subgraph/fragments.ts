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
    types {
      nodes {
        id
      }
    }
    name
    triples {
      nodes {
        attributeId
        textValue
        valueType
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
          // @TODO: Also fetch the triples in case we're rendering an image
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
