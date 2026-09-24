import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { COMMENT_REPLY_TO_ID } from '~/core/comment-ids';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID, SOURCES_PROPERTY_ID } from '~/core/debates/ontology';

/**
 * What "how much has happened to this claim" means, and the fields it is read from.
 *
 * Deliberately **not** a client module. The explore card's selection is assembled on the server, and
 * a `'use client'` module imported from there is replaced by a client-reference proxy at build time
 * — the interpolated fields come out empty and the query fails to parse, which is how this split
 * was found. The hook that runs these lives next door in `claim-activity-count.ts`.
 *
 * The number covers everything the claim page's feed draws by default: the debates held on the
 * claim, the claims extracted from those debates, and every comment anywhere in that tree. One
 * definition, so the claim card and the claim page cannot disagree about it.
 *
 * Two facts about the graph make it affordable, both measured rather than assumed:
 *
 * 1. **Comment depth is free.** A reply carries a `Reply to` relation to *every* ancestor, not just
 *    its parent (see `use-comments.ts`), so one `backlinks` aggregate counts an entity's whole
 *    comment tree at any depth. Nothing here walks replies.
 *
 * 2. **Extracted claims can be counted from the debate.** They are published with a `Sources`
 *    relation pointing back at it, so counting them is one aggregate rather than the
 *    Debate → Transcripts → Blocks → Claims traversal used to *read* them. Measured against testnet
 *    on 2026-09-24: identical totals (177 across 30 debates), 0.52s versus 3.48s.
 *
 * Adding these to the shared explore card selection costs +0.02s and +1 KB over a 20-card page,
 * because for anything that is not a claim the relation lookups come back empty immediately — which
 * is why there is no claim-only selection to maintain.
 */
export const CLAIM_ACTIVITY_COUNT_FIELDS = /* GraphQL */ `
  activityComments: backlinks(filter: { typeId: { is: "${COMMENT_REPLY_TO_ID}" } }) {
    totalCount
  }
  activityDebates: backlinksList(
    filter: {
      typeId: { is: "${DEBATE_CLAIMS_PROPERTY_ID}" }
      fromEntity: { typeIds: { overlaps: ["${DEBATE_TYPE_ID}"] } }
    }
  ) {
    fromEntity {
      id
      comments: backlinks(filter: { typeId: { is: "${COMMENT_REPLY_TO_ID}" } }) {
        totalCount
      }
      extracted: backlinksList(
        filter: {
          typeId: { is: "${SOURCES_PROPERTY_ID}" }
          fromEntity: { typeIds: { overlaps: ["${CLAIM_TYPE_ID}"] } }
        }
      ) {
        fromEntity {
          id
          comments: backlinks(filter: { typeId: { is: "${COMMENT_REPLY_TO_ID}" } }) {
            totalCount
          }
        }
      }
    }
  }
`;

/** The parts, so a caller can explain the number rather than only print it. */
export type ClaimActivityCount = {
  /** Comments on the claim itself, replies included. */
  comments: number;
  debates: number;
  extractedClaims: number;
  /** Comments anywhere under a debate or one of its extracted claims. */
  debateComments: number;
  total: number;
};

function commentsOf(entity: { comments?: { totalCount?: number | null } | null } | null | undefined): number {
  return entity?.comments?.totalCount ?? 0;
}

/**
 * The count for one entity's node, from either shape the fields arrive in.
 *
 * The batched query aliases them `comments`/`debates`; the explore card selection has to prefix its
 * own (`activityComments`/`activityDebates`) because a card node already selects an unaliased
 * `backlinks` for its comment pill. One function reads both, so the two cannot drift into counting
 * different things.
 */
export function countActivityForNode(node: unknown): ClaimActivityCount {
  const raw = (node ?? {}) as Record<string, any>;
  const claimComments = (raw.comments ?? raw.activityComments)?.totalCount ?? 0;
  const debates = ((raw.debates ?? raw.activityDebates ?? []) as Array<any>).flatMap(row =>
    row?.fromEntity ? [row.fromEntity] : []
  );

  let extractedClaims = 0;
  let debateComments = 0;
  for (const debate of debates) {
    debateComments += commentsOf(debate);
    for (const row of (debate.extracted ?? []) as Array<any>) {
      if (!row?.fromEntity) continue;
      extractedClaims += 1;
      debateComments += commentsOf(row.fromEntity);
    }
  }

  return {
    comments: claimComments,
    debates: debates.length,
    extractedClaims,
    debateComments,
    total: claimComments + debates.length + extractedClaims + debateComments,
  };
}
