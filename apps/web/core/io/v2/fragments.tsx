import { graphql } from '~/core/gql';

export const entityFragment = graphql(/* GraphQL */ `
  fragment FullEntity on Entity {
    id
    name
    description
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
      to {
        id
        name
      }
      toSpaceId
      type {
        id
        name
      }
    }
  }
`);

export const entitiesQuery = graphql(/* GraphQL */ `
  query AllEntities {
    entities {
      ...FullEntity
    }
  }
`);
