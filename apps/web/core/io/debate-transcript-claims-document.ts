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
    $markdownPropertyId: UUID!
    $offsetPropertyIds: [UUID!]
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
              # The turn's text, per space. This is the verbatim concatenation of the speaker's
              # Whisper segments, which is what lets claim-timing.ts locate the turn on the
              # video timeline by matching it back against the transcript.
              markdown: valuesList(filter: { propertyId: { is: $markdownPropertyId } }) {
                spaceId
                text
              }
              authors: relationsList(filter: { typeId: { is: $authorsPropertyId }, spaceId: { is: $spaceId } }) {
                toEntity {
                  id
                }
              }
              claims: relationsList(filter: { typeId: { is: $claimsPropertyId }, spaceId: { is: $spaceId } }) {
                position
                # The id of the relation entity below, which is what a publisher writes timecodes
                # onto. The app only reads them, so nothing here needs it — the backfill scripts do,
                # and carrying it means they read this traversal rather than re-walking their own.
                entityId
                # The relation's own entity, which is where the claim's timecodes live — not on the
                # claim, because one claim can be stated in two turns and each statement has its
                # own moment. Populated for most of the corpus since the backfill (921 of 1,072
                # statements as of 2026-09-23); claim-timing.ts falls back to matching for the rest.
                entity {
                  valuesList(filter: { propertyId: { in: $offsetPropertyIds }, spaceId: { is: $spaceId } }) {
                    propertyId
                    integer
                  }
                }
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

/** A block → claim relation, which carries the claim's timecodes on its own entity. */
type ClaimRelationNode = {
  position?: string | null;
  /** The relation entity's id — where a claim's timecodes are published. */
  entityId?: string | null;
  /** Integer values arrive as strings, the way the API serialises them. */
  entity?: { valuesList?: Array<{ propertyId: string; integer?: string | null } | null> | null } | null;
  toEntity: ClaimEntity | null;
} | null;

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
            markdown?: Array<{ spaceId: string; text?: string | null } | null> | null;
            authors: Array<RelationNode<{ id: string }>> | null;
            claims: Array<ClaimRelationNode> | null;
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
  markdownPropertyId: string;
  offsetPropertyIds: string[];
};

export const debateTranscriptClaimsDocument = parse(DEBATE_TRANSCRIPT_CLAIMS_SOURCE) as TypedDocumentNode<
  DebateTranscriptClaimsQuery,
  DebateTranscriptClaimsVariables
>;
