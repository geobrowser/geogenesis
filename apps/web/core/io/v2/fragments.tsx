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
        id
        entity {
          id
          name
        }
        dataType
        relationValueTypes {
          id
          name
        }
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

    types {
      id
      name
    }
    spaces
  }
`);

export const resultQuery = graphql(/* GraphQL */ `
  query Result($id: String!, $spaceId: String) {
    entity(id: $id, spaceId: $spaceId) {
      ...Result
    }
  }
`);
