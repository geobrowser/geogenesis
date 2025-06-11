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
  query AllEntities($limit: Int, $offset: Int) {
    entities(limit: $limit, offset: $offset) {
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
