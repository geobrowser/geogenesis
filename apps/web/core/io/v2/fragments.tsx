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
      }
      toSpaceId
      type {
        id
        entity {
          name
        }
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

export const entityQuery = graphql(/* GraphQL */ `
  query Entity($id: String!) {
    entity(id: $id) {
      ...FullEntity
    }
  }
`);
