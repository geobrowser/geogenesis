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
 * Hand-written rather than generated so it doesn't require regenerating `gql.ts`.
 */
const DEBATE_TRANSCRIPT_CLAIMS_SOURCE = /* GraphQL */ `
  query DebateTranscriptClaims(
    $id: UUID!
    $transcriptsPropertyId: UUID!
    $blocksPropertyId: UUID!
    $authorsPropertyId: UUID!
    $claimsPropertyId: UUID!
    $isFactualPropertyId: UUID!
  ) {
    entity(id: $id) {
      transcripts: relationsList(filter: { typeId: { is: $transcriptsPropertyId } }) {
        position
        toEntity {
          id
          blocks: relationsList(filter: { typeId: { is: $blocksPropertyId } }) {
            position
            toEntity {
              id
              authors: relationsList(filter: { typeId: { is: $authorsPropertyId } }) {
                toEntity {
                  id
                }
              }
              claims: relationsList(filter: { typeId: { is: $claimsPropertyId } }) {
                position
                toEntity {
                  id
                  name
                  # Where the claim actually lives, which is what its responses are published
                  # against — not necessarily the space the panel is being rendered from.
                  spaceIds
                  # "Is factual" decides the response vocabulary: Verify/Dispute when set,
                  # Agree/Disagree otherwise. Read per space, so it comes back with its own.
                  valuesList(filter: { propertyId: { is: $isFactualPropertyId } }) {
                    spaceId
                    propertyId
                    text
                    # "Is factual" is a checkbox, so it lands in the boolean column and the text
                    # column is null. Reading only text made every claim look non-factual.
                    boolean
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
  valuesList?: Array<{
    spaceId: string;
    propertyId: string;
    text?: string | null;
    boolean?: boolean | null;
  } | null> | null;
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
  isFactualPropertyId: string;
};

export const debateTranscriptClaimsDocument = parse(DEBATE_TRANSCRIPT_CLAIMS_SOURCE) as TypedDocumentNode<
  DebateTranscriptClaimsQuery,
  DebateTranscriptClaimsVariables
>;
