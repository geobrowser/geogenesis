import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

/**
 * Every claim extracted from a debate's transcript, with the speaker each one is attributed to.
 *
 * The traversal is Debate → Transcripts → Blocks → (Authors, Claims). Attribution rides the *text
 * block's* `Authors` relation, not the claim's: `debate-publish-draft.ts` deliberately publishes
 * claims with only `Types` and `Sources`, so a claim's speaker is only knowable one hop up. Claims
 * elsewhere in the graph (podcasts, articles) do carry their own `Authors` pointing at a Person —
 * that is a different shape and this query would not find it.
 *
 * The `Authors` target is the speaker's personal space entity, which is the same id as
 * `DebateParticipant.profile_space_id`, so the grouping joins straight onto the panel's rows.
 *
 * One round trip for the whole transcript. `position` comes back on both relation lists so the
 * caller can restore transcript order — `relationsList` is not ordered by it.
 *
 * Every hop is filtered to the debate's publication space, the way the app's own entity query
 * scopes the relations it displays. Relations are space-attributed and anyone may publish one in
 * their own space pointing at any entity, so an unscoped traversal would let a stranger's `Claims`
 * relation on a debater's text block appear in this panel as something that debater said.
 *
 * Hand-written rather than generated so it doesn't require regenerating `gql.ts`.
 */
const DEBATE_TRANSCRIPT_CLAIMS_SOURCE = /* GraphQL */ `
  query DebateTranscriptClaims(
    $id: UUID!
    $transcriptsPropertyId: UUID!
    $blocksPropertyId: UUID!
    $authorsPropertyId: UUID!
    $claimsPropertyId: UUID!
    $spaceId: UUID!
    $namePropertyId: UUID!
  ) {
    entity(id: $id) {
      transcripts: relationsList(filter: { typeId: { is: $transcriptsPropertyId }, spaceId: { is: $spaceId } }) {
        position
        toEntity {
          id
          blocks: relationsList(filter: { typeId: { is: $blocksPropertyId }, spaceId: { is: $spaceId } }) {
            position
            toEntity {
              id
              authors: relationsList(filter: { typeId: { is: $authorsPropertyId }, spaceId: { is: $spaceId } }) {
                toEntity {
                  id
                }
              }
              claims: relationsList(filter: { typeId: { is: $claimsPropertyId }, spaceId: { is: $spaceId } }) {
                position
                toEntity {
                  id
                  # Not space-scoped, so only a last resort — see the note above.
                  name
                  # Candidate spaces. Not a home-space list on its own: it also counts spaces
                  # holding an outbound relation, so its raw order cannot pick one.
                  spaceIds
                  # The claim sentence per space. The aggregated name field above merges spaces, so a
                  # Name published for this claim elsewhere could otherwise rewrite what a debater
                  # is shown to have said.
                  names: valuesList(filter: { propertyId: { is: $namePropertyId } }) {
                    spaceId
                    text
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

type RelationNode<T> = { position?: string | null; toEntity: T | null } | null;

type ClaimEntity = {
  id: string;
  name?: string | null;
  spaceIds?: Array<string | null> | null;
  names?: Array<{ spaceId: string; text?: string | null } | null> | null;
};

export type DebateTranscriptClaimsQuery = {
  entity: {
    transcripts: Array<
      RelationNode<{
        id: string;
        blocks: Array<
          RelationNode<{
            id: string;
            authors: Array<RelationNode<{ id: string }>> | null;
            claims: Array<RelationNode<ClaimEntity>> | null;
          }>
        > | null;
      }>
    > | null;
  } | null;
};

type DebateTranscriptClaimsVariables = {
  id: string;
  transcriptsPropertyId: string;
  blocksPropertyId: string;
  authorsPropertyId: string;
  claimsPropertyId: string;
  spaceId: string;
  namePropertyId: string;
};

export const debateTranscriptClaimsDocument = parse(DEBATE_TRANSCRIPT_CLAIMS_SOURCE) as TypedDocumentNode<
  DebateTranscriptClaimsQuery,
  DebateTranscriptClaimsVariables
>;
