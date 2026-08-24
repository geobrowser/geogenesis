/**
 * NATURAL server order + client `votedAt` sort: `VOTED_AT_*` + cursor 500s on the live API.
 */
export const UserEntityVotesByTypeDocumentSource = /* GraphQL */ `
  query UserEntityVotesByType($userId: UUID!, $voteType: Int!, $objectType: Int!, $first: Int!, $after: Cursor) {
    userVotesConnection(
      first: $first
      after: $after
      condition: { userId: $userId, voteType: $voteType, objectType: $objectType }
    ) {
      nodes {
        objectId
        voteKind
        votedAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
