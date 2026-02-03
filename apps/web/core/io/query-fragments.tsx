import { graphql } from '~/core/gql';

export const entityFragment = graphql(/* GraphQL */ `
  fragment FullEntity on Entity {
    id
    name
    description
    spaceIds
    updatedAt

    types {
      id
      name
    }

    valuesList {
      spaceId
      property {
        ...PropertyFragment
      }
      text
      integer
      float
      point
      boolean
      time
      language
      unit
      datetime
      date
      decimal
      bytes
    }

    relationsList {
      id
      spaceId
      position
      verified
      entityId
      fromEntity {
        id
        name
      }
      toEntity {
        id
        name
        types {
          id
          name
        }
        valuesList {
          propertyId
          text
          integer
          float
          point
          boolean
          time
          datetime
          date
          decimal
          bytes
        }
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
  query AllEntities(
    $spaceId: UUID
    $typeIds: UUIDFilter
    $limit: Int
    $offset: Int
    $filter: EntityFilter
    $orderBy: [EntitiesOrderBy!]
  ) {
    entities(first: $limit, offset: $offset, filter: $filter, orderBy: $orderBy, spaceId: $spaceId, typeIds: $typeIds) {
      id
      name
      description
      spaceIds
      updatedAt

      types {
        id
        name
      }

      valuesList(filter: { spaceId: { is: $spaceId } }) {
        spaceId
        property {
          ...PropertyFragment
        }
        text
        integer
        float
        point
        boolean
        time
        language
        unit
        datetime
        date
        decimal
        bytes
      }

      relationsList(filter: { spaceId: { is: $spaceId } }) {
        id
        spaceId
        position
        verified
        entityId
        fromEntity {
          id
          name
        }
        toEntity {
          id
          name
          types {
            id
            name
          }
          valuesList {
            propertyId
            text
            integer
            float
            point
            boolean
            time
            datetime
            date
            decimal
            bytes
          }
        }
        toSpaceId
        type {
          id
          name
        }
      }
    }
  }
`);

export const entitiesBatchQuery = graphql(/* GraphQL */ `
  query EntitiesBatch($filter: EntityFilter, $spaceId: UUID) {
    entities(filter: $filter, spaceId: $spaceId) {
      id
      name
      description
      spaceIds

      types {
        id
        name
      }

      valuesList(filter: { spaceId: { is: $spaceId } }) {
        spaceId
        property {
          ...PropertyFragment
        }
        text
        integer
        float
        point
        boolean
        time
        language
        unit
        datetime
        date
        decimal
        bytes
      }

      relationsList(filter: { spaceId: { is: $spaceId } }) {
        id
        spaceId
        position
        verified
        entityId
        fromEntity {
          id
          name
        }
        toEntity {
          id
          name
          types {
            id
            name
          }
          valuesList {
            propertyId
            text
            integer
            float
            point
            boolean
            time
            datetime
            date
            decimal
            bytes
          }
        }
        toSpaceId
        type {
          id
          name
        }
      }
    }
  }
`);

export const entityQuery = graphql(/* GraphQL */ `
  query Entity($id: UUID!, $spaceId: UUID) {
    entity(id: $id) {
      id
      name
      description
      spaceIds

      types {
        id
        name
      }

      valuesList(filter: { spaceId: { is: $spaceId } }) {
        spaceId
        property {
          ...PropertyFragment
        }
        text
        integer
        float
        point
        boolean
        time
        language
        unit
        datetime
        date
        decimal
        bytes
      }

      relationsList(filter: { spaceId: { is: $spaceId } }) {
        id
        spaceId
        position
        verified
        entityId
        fromEntity {
          id
          name
        }
        toEntity {
          id
          name
          types {
            id
            name
          }
          valuesList {
            propertyId
            text
            integer
            float
            point
            boolean
            time
            datetime
            date
            decimal
            bytes
          }
        }
        toSpaceId
        type {
          id
          name
        }
      }
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
    entity {
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
      types {
        id
        name
      }
      valuesList {
        propertyId
        text
        integer
        float
        point
        boolean
        time
        datetime
        date
        decimal
        bytes
      }
    }
    toSpaceId
    type {
      id
      name
    }
  }
`);

export const relationEntityRelationsQuery = graphql(/* GraphQL */ `
  query RelationEntityRelations($id: UUID!, $spaceId: UUID) {
    relations(filter: { entityId: { is: $id }, spaceId: { is: $spaceId } }) {
      ...FullRelation
    }
  }
`);

export const entityPageQuery = graphql(/* GraphQL */ `
  query EntityPage($id: UUID!, $spaceId: UUID) {
    entity(id: $id) {
      id
      name
      description
      spaceIds

      types {
        id
        name
      }

      valuesList(filter: { spaceId: { is: $spaceId } }) {
        spaceId
        property {
          ...PropertyFragment
        }
        text
        integer
        float
        point
        boolean
        time
        language
        unit
        datetime
        date
        decimal
        bytes
      }

      relationsList(filter: { spaceId: { is: $spaceId } }) {
        id
        spaceId
        position
        verified
        entityId
        fromEntity {
          id
          name
        }
        toEntity {
          id
          name
          types {
            id
            name
          }
          valuesList {
            propertyId
            text
            integer
            float
            point
            boolean
            time
            datetime
            date
            decimal
            bytes
          }
        }
        toSpaceId
        type {
          id
          name
        }
      }
    }
    relations(filter: { entityId: { is: $id }, spaceId: { is: $spaceId } }) {
      ...FullRelation
    }
  }
`);

export const entityTypesQuery = graphql(/* GraphQL */ `
  query EntityTypes($id: UUID!, $spaceId: UUID) {
    entity(id: $id) {
      types(filter: { spaceIds: { anyEqualTo: $spaceId } }) {
        id
        name
      }
    }
  }
`);

export const entityBacklinksQuery = graphql(/* GraphQL */ `
  query EntityBacklinksPage($id: UUID!, $spaceId: UUID) {
    entity(id: $id) {
      backlinksList(filter: { spaceId: { is: $spaceId } }) {
        spaceId
        fromEntity {
          id
          name
          spaceIds
          types {
            id
            name
            spaceIds
          }
        }
      }
    }
  }
`);

export const spaceFragment = graphql(/* GraphQL */ `
  fragment FullSpace on Space {
    id
    type
    address

    membersList {
      memberSpaceId
    }

    editorsList {
      memberSpaceId
    }

    page {
      ...FullEntity
    }
  }
`);

export const spaceQuery = graphql(/* GraphQL */ `
  query Space($id: UUID!) {
    space(id: $id) {
      ...FullSpace
    }
  }
`);

export const spacesQuery = graphql(/* GraphQL */ `
  query Spaces($filter: SpaceFilter, $limit: Int, $offset: Int) {
    spaces(filter: $filter, first: $limit, offset: $offset) {
      ...FullSpace
    }
  }
`);

export const spacesWhereMemberQuery = graphql(/* GraphQL */ `
  query SpacesWhereMember($memberSpaceId: UUID!) {
    spaces(filter: { members: { some: { memberSpaceId: { is: $memberSpaceId } } } }) {
      ...FullSpace
    }
  }
`);

export const propertyFragment = graphql(/* GraphQL */ `
  fragment PropertyFragment on PropertyInfo {
    id
    name
    dataTypeName
  }
`);

export const propertyQuery = graphql(/* GraphQL */ `
  query Property($id: UUID!) {
    property(id: $id) {
      ...PropertyFragment
    }
  }
`);

export const propertiesBatchQuery = graphql(/* GraphQL */ `
  query PropertiesBatch($ids: [UUID!]!) {
    properties(filter: { id: { in: $ids } }) {
      ...PropertyFragment
    }
  }
`);

export const resultQuery = graphql(/* GraphQL */ `
  query Result($id: UUID!) {
    entity(id: $id) {
      id
      name
      description
      spaceIds
      types {
        id
        name
      }
    }
  }
`);

export const resultsQuery = graphql(/* GraphQL */ `
  query Results($query: String!, $filter: EntityFilter, $spaceId: UUID, $limit: Int, $offset: Int) {
    search(query: $query, filter: $filter, spaceId: $spaceId, first: $limit, offset: $offset) {
      id
      name
      description
      spaceIds
      types {
        id
        name
      }
    }
  }
`);

export const relationEntityQuery = graphql(/* GraphQL */ `
  query RelationEntityMinimal($id: UUID!, $spaceId: UUID) {
    relation(id: $id) {
      id
      entity {
        id
        name
        description
        spaceIds

        types {
          id
          name
        }

        valuesList(filter: { spaceId: { is: $spaceId } }) {
          spaceId
          property {
            id
            name
            dataTypeName
          }
          text
          integer
          float
          point
          boolean
          time
          language
          unit
          datetime
          date
          decimal
          bytes
        }
        relationsList {
          verified
          toSpaceId
          position
          spaceId
          id
          entityId
          fromEntity {
            id
            name
          }
          toEntity {
            id
            name
            types {
              id
              name
            }
            valuesList {
              propertyId
              text
              integer
              float
              point
              boolean
              time
              datetime
              date
              decimal
              bytes
            }
          }
          type {
            id
            name
            description
          }
        }
      }
    }
  }
`);
