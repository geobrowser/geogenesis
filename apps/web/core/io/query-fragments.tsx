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
      schedule
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
          spaceId
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
          schedule
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
    $spaceIds: UUIDFilter
    $typeId: UUID
    $typeIds: UUIDFilter
    $limit: Int
    $offset: Int
    $filter: EntityFilter
    $orderBy: [EntitiesOrderBy!]
  ) {
    entities(
      first: $limit
      offset: $offset
      filter: $filter
      orderBy: $orderBy
      spaceId: $spaceId
      spaceIds: $spaceIds
      typeId: $typeId
      typeIds: $typeIds
    ) {
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
        schedule
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
            spaceId
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
            schedule
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
        schedule
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
            spaceId
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
            schedule
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
      updatedAt

      types {
        id
        name
      }

      # Lightweight cross-space view used to decide which space an entity link
      # routes to. The main valuesList/relationsList below are space-scoped for
      # display, so we need an unscoped projection to know which spaces hold
      # real (non-hidden) content.
      allValuesList: valuesList {
        spaceId
        property {
          id
        }
      }

      allRelationsList: relationsList {
        spaceId
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
        schedule
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
            spaceId
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
            schedule
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
        spaceId
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
        schedule
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

export const relationsByToEntityIdsQuery = graphql(/* GraphQL */ `
  query RelationsByToEntityIds($toEntityIds: [UUID!]!, $typeId: UUID, $spaceId: UUID) {
    relations(filter: { toEntityId: { in: $toEntityIds }, typeId: { is: $typeId }, spaceId: { is: $spaceId } }) {
      id
      toEntityId
      spaceId
      fromEntityId
    }
  }
`);

export const relationsByFromEntityIdQuery = graphql(/* GraphQL */ `
  query RelationsByFromEntityId($fromEntityId: UUID!, $typeId: UUID!, $spaceId: UUID!) {
    relations(filter: { fromEntityId: { is: $fromEntityId }, typeId: { is: $typeId }, spaceId: { is: $spaceId } }) {
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

      # Lightweight cross-space view used to decide which space an entity link
      # routes to. The main valuesList/relationsList below are space-scoped for
      # display, so we need an unscoped projection to know which spaces hold
      # real (non-hidden) content.
      allValuesList: valuesList {
        spaceId
        property {
          id
        }
      }

      allRelationsList: relationsList {
        spaceId
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
        schedule
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
            spaceId
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
            schedule
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

export const entityExistsQuery = graphql(/* GraphQL */ `
  query EntityExists($id: UUID!) {
    entity(id: $id) {
      id
    }
  }
`);

export const entityCommentReplyBacklinksPageQuery = graphql(/* GraphQL */ `
  query EntityCommentReplyBacklinksPage(
    $id: UUID!
    $replyToTypeId: UUID!
    $commentTypeId: UUID!
    $first: Int!
    $offset: Int!
  ) {
    entity(id: $id) {
      backlinksList(
        first: $first
        offset: $offset
        filter: { typeId: { is: $replyToTypeId }, fromEntity: { typeIds: { overlaps: [$commentTypeId] } } }
      ) {
        fromEntity {
          id
        }
      }
    }
  }
`);

export const entitiesBatchForCommentsQuery = graphql(/* GraphQL */ `
  query EntitiesBatchForComments($filter: EntityFilter) {
    entities(filter: $filter) {
      id
      name
      description
      spaceIds
      createdAt
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
        schedule
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
            spaceId
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
            schedule
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
    topicId

    topic {
      ...FullEntity
    }

    members {
      totalCount
    }

    membersList {
      memberSpaceId
    }

    editors {
      totalCount
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

// Targeted membership/editorship checks.
// `membersList`/`editorsList` is paginated server-side (default 100), so a
// client-side `includes()` against `space.membersList` misses members past
// the first page. These queries filter server-side and ask for a single row.
export const isMemberOfSpaceQuery = graphql(/* GraphQL */ `
  query IsMemberOfSpace($spaceId: UUID!, $memberSpaceId: UUID!) {
    space(id: $spaceId) {
      membersList(filter: { memberSpaceId: { is: $memberSpaceId } }, first: 1) {
        memberSpaceId
      }
    }
  }
`);

export const isEditorOfSpaceQuery = graphql(/* GraphQL */ `
  query IsEditorOfSpace($spaceId: UUID!, $memberSpaceId: UUID!) {
    space(id: $spaceId) {
      editorsList(filter: { memberSpaceId: { is: $memberSpaceId } }, first: 1) {
        memberSpaceId
      }
    }
  }
`);

// Paginated members/editors. `totalCount` is authoritative for the count
// shown in the chip and footers; `membersList`/`editorsList` carry the
// current page of memberSpaceIds.
export const spaceMembersPageQuery = graphql(/* GraphQL */ `
  query SpaceMembersPage($spaceId: UUID!, $first: Int!, $offset: Int!) {
    space(id: $spaceId) {
      members {
        totalCount
      }
      membersList(first: $first, offset: $offset) {
        memberSpaceId
      }
    }
  }
`);

export const spaceEditorsPageQuery = graphql(/* GraphQL */ `
  query SpaceEditorsPage($spaceId: UUID!, $first: Int!, $offset: Int!) {
    space(id: $spaceId) {
      editors {
        totalCount
      }
      editorsList(first: $first, offset: $offset) {
        memberSpaceId
      }
    }
  }
`);

export const propertyFragment = graphql(/* GraphQL */ `
  fragment PropertyFragment on PropertyInfo {
    id
    name
    dataTypeId
    dataTypeName
    renderableTypeId
    renderableTypeName
    format
    isType
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

export const entityNamesQuery = graphql(/* GraphQL */ `
  query EntityNames($filter: EntityFilter) {
    entities(filter: $filter) {
      id
      name
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

/**
 * Batch name resolution via the `values` endpoint.
 * Matches multiple names in one request using `text: { inInsensitive }`.
 * Returns entity metadata + connection counts for second-order ranking.
 */
export const importNameValuesQuery = graphql(/* GraphQL */ `
  query ImportNameValues($propertyId: UUID!, $texts: [String!], $first: Int, $entityFilter: EntityFilter) {
    values(
      condition: { propertyId: $propertyId }
      filter: { text: { inInsensitive: $texts }, entity: $entityFilter }
      first: $first
    ) {
      id
      text
      spaceId
      entity {
        id
        name
        typeIds
        backlinks {
          totalCount
        }
        relations {
          totalCount
        }
      }
    }
  }
`);

export const entityTiebreakerBatchQuery = graphql(/* GraphQL */ `
  query EntityTiebreakerBatch($filter: EntityFilter) {
    entities(filter: $filter) {
      id
      createdAt
      backlinks {
        totalCount
      }
      relations {
        totalCount
      }
      values {
        totalCount
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

        allValuesList: valuesList {
          spaceId
          property {
            id
          }
        }

        allRelationsList: relationsList {
          spaceId
        }

        valuesList(filter: { spaceId: { is: $spaceId } }) {
          spaceId
          property {
            id
            name
            dataTypeId
            dataTypeName
            renderableTypeId
            renderableTypeName
            format
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
          schedule
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
              spaceId
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
              schedule
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

export const entityVoteCountQuery = graphql(/* GraphQL */ `
  query EntityVoteCount($objectId: UUID!, $objectType: Int!) {
    votesCountsConnection(condition: { objectId: $objectId, objectType: $objectType }) {
      nodes {
        spaceId
        upvotes
        downvotes
      }
    }
  }
`);

export const userEntityVoteQuery = graphql(/* GraphQL */ `
  query UserEntityVote($userId: UUID!, $objectId: UUID!, $objectType: Int!, $spaceId: UUID!) {
    userVoteByUserIdAndObjectIdAndObjectTypeAndSpaceId(
      userId: $userId
      objectId: $objectId
      objectType: $objectType
      spaceId: $spaceId
    ) {
      voteType
    }
  }
`);

export const entityVotersQuery = graphql(/* GraphQL */ `
  query EntityVoters($objectId: UUID!, $objectType: Int!, $spaceId: UUID!) {
    userVotes(condition: { objectId: $objectId, objectType: $objectType, spaceId: $spaceId }) {
      userId
      voteType
    }
  }
`);
