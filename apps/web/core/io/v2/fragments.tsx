import { graphql } from '~/core/gql';

export const entityFragment = graphql(/* GraphQL */ `
  fragment FullEntity on Entity {
    id
    name
    description

    types {
      id
      name
    }

    values {
      spaceId
      property {
        ...PropertyFragment
      }
      value
      language
      unit
    }

    relations {
      id
      spaceId
      position
      verified
      entityId
      from {
        id
        name
      }
      to {
        id
        name
        types {
          id
          name
        }
        values {
          propertyId
          value
        }
      }
      toSpaceId
      type {
        id
        entity {
          name
        }
        renderableType
      }
    }
  }
`);

export const entitiesQuery = graphql(/* GraphQL */ `
  query AllEntities($spaceId: String, $limit: Int, $offset: Int) {
    entities(spaceId: $spaceId, limit: $limit, offset: $offset) {
      ...FullEntity
    }
  }
`);

export const entitiesBatchQuery = graphql(/* GraphQL */ `
  query EntitiesBatch($ids: [String!]!, $spaceId: String) {
    entities(spaceId: $spaceId, filter: { id: { in: $ids } }) {
      ...FullEntity
    }
  }
`);

export const entityQuery = graphql(/* GraphQL */ `
  query Entity($id: String!, $spaceId: String) {
    entity(id: $id, spaceId: $spaceId) {
      ...FullEntity
    }
  }
`);

export const relationFragment = graphql(/* GraphQL */ `
  fragment FullRelation on Relation {
    id
    spaceId
    position
    verified
    entityId
    from {
      id
      name
    }
    to {
      id
      name
      types {
        id
        name
      }
      values {
        propertyId
        value
      }
    }
    toSpaceId
    type {
      id
      entity {
        name
      }
      renderableType
    }
  }
`);

export const relationEntityRelationsQuery = graphql(/* GraphQL */ `
  query RelationEntityRelations($id: String!, $spaceId: String) {
    relations(filter: { relationEntityId: $id }, spaceId: $spaceId) {
      ...FullRelation
    }
  }
`);

export const entityPageQuery = graphql(/* GraphQL */ `
  query EntityPage($id: String!, $spaceId: String) {
    entity(id: $id, spaceId: $spaceId) {
      ...FullEntity
    }
    relations(filter: { relationEntityId: $id }, spaceId: $spaceId) {
      ...FullRelation
    }
  }
`);

export const entityTypesQuery = graphql(/* GraphQL */ `
  query EntityTypes($id: String!, $spaceId: String) {
    entity(id: $id, spaceId: $spaceId) {
      types {
        id
        name
      }
    }
  }
`);

export const spaceFragment = graphql(/* GraphQL */ `
  fragment FullSpace on Space {
    id
    type
    daoAddress
    spaceAddress
    mainVotingAddress
    membershipAddress
    personalAddress

    members {
      address
    }

    editors {
      address
    }

    entity {
      ...FullEntity
    }
  }
`);

export const spaceQuery = graphql(/* GraphQL */ `
  query Space($id: String!) {
    space(id: $id) {
      ...FullSpace
    }
  }
`);

export const spacesQuery = graphql(/* GraphQL */ `
  query Spaces($filter: SpaceFilter, $limit: Int, $offset: Int) {
    spaces(filter: $filter, limit: $limit, offset: $offset) {
      ...FullSpace
    }
  }
`);

export const resultFragment = graphql(/* GraphQL */ `
  fragment Result on Entity {
    id
    name
    description
    spaces
    types {
      id
      name
    }
  }
`);

export const propertyFragment = graphql(/* GraphQL */ `
  fragment PropertyFragment on Property {
    id
    dataType
    renderableType
    relationValueTypes {
      id
      name
    }
    entity {
      id
      name
    }
  }
`);

export const propertyQuery = graphql(/* GraphQL */ `
  query Property($id: String!) {
    property(id: $id) {
      ...PropertyFragment
    }
  }
`);

export const propertiesBatchQuery = graphql(/* GraphQL */ `
  query PropertiesBatch($ids: [String!]!) {
    properties(filter: { id: { in: $ids } }) {
      ...PropertyFragment
    }
  }
`);

export const resultQuery = graphql(/* GraphQL */ `
  query Result($id: String!, $spaceId: String) {
    entity(id: $id, spaceId: $spaceId) {
      ...Result
    }
  }
`);

export const resultsQuery = graphql(/* GraphQL */ `
  query Results($query: String!, $filter: SearchFilter, $spaceId: String, $limit: Int, $offset: Int) {
    search(query: $query, filter: $filter, spaceId: $spaceId, limit: $limit, offset: $offset) {
      ...Result
    }
  }
`);
