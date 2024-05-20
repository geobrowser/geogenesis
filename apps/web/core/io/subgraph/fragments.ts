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
  textValue
  valueType
  space {
    id
  }
`

export const spacePluginsFragment = `
  mainVotingPluginAddress
  memberAccessPluginAddress
  spacePluginAddress
`

export const geoEntityFragment = `
  id
  name
  triplesByEntityId(filter: {isStale: {equalTo: false}}) {
    nodes {
      ${tripleFragment}
    }
  }
`

export const spaceMetadataFragment = `
  name
  triplesByEntityId(filter: {isStale: {equalTo: false}}) {
    nodes {
      ${tripleFragment}
    }
  }
`