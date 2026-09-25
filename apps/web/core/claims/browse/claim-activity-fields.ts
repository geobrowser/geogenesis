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
 * Adding these to the shared explore card selection is cheap for anything that is not a claim — the
 * relation lookups come back empty immediately — which is why there is no claim-only selection to
 * maintain. Measured on the 20 busiest claims in the corpus, which is the worst case rather than a
 * typical page: 0.57s and 28 KB, every total matching what the same fields read one claim at a time.
 *
 * ## Why every nested list carries an explicit `first`
 *
 * A nested `backlinksList` inside a *list* query (`entities(filter: { id: { in: … } })`, which is
 * both how this is batched and how the explore feed selects its cards) is silently truncated to ten
 * rows. The singular `entity(id:)` form is not. So the same fields read one number on a claim page
 * and a smaller one on a card — measured on testnet 2026-09-24: a debate with 22 extracted claims
 * returned `totalCount: 22` next to a ten-item list, and a claim whose feed draws 52 rows counted 33.
 * Nothing errors; the list just stops. An explicit `first` lifts it.
 *
 * The extracted-claim total is therefore taken from an aggregate rather than from the list's length,
 * so it stays exact whatever `first` is. The list survives only to reach the comment counts hanging
 * off those claims, which no aggregate on the debate can see two hops away.
 */

/**
 * ## Two ways this can disagree with the rows, both latent
 *
 * The feed draws debates scoped to the space the claim is being read through, and at most
 * `ACTIVITY_DEBATE_LIMIT` of them. This counts every debate on the claim, in any space. So a claim
 * with a debate published into another space, or with more than ten of them, would print a heading
 * larger than the rows below it.
 *
 * Measured rather than assumed, on testnet 2026-09-25: across the 25 busiest claims, **no** debate
 * sits outside its claim's display space, and the most debates on any one claim is five. Neither
 * case exists yet.
 *
 * Left unscoped on purpose. The number's job is that the claim card in Explore and the claim page
 * agree, and the card's selection is one string applied to a page of cards from many spaces — there
 * is no space id to interpolate. Scoping this would fix the page and leave the card wrong, so the
 * two would disagree precisely when the count is wrong today. Fixing it properly means either a
 * per-space card query or moving the count server-side; both are their own change, and both need a
 * decision about whether a claim's activity is a per-space or a global number.
 */

/**
 * Bounds for the nested lists.
 *
 * Generous against the corpus rather than tight: the most debates on one claim is five and the most
 * claims from one debate is 22. These exist to defeat the implicit ten, not to ration.
 */
const DEBATES_PER_CLAIM = 50;
const EXTRACTED_PER_DEBATE = 200;

export const CLAIM_ACTIVITY_COUNT_FIELDS = /* GraphQL */ `
  activityComments: backlinks(filter: { typeId: { is: "${COMMENT_REPLY_TO_ID}" } }) {
    totalCount
  }
  activityDebates: backlinksList(
    first: ${DEBATES_PER_CLAIM}
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
      extractedCount: backlinks(
        filter: {
          typeId: { is: "${SOURCES_PROPERTY_ID}" }
          fromEntity: { typeIds: { overlaps: ["${CLAIM_TYPE_ID}"] } }
        }
      ) {
        totalCount
      }
      extracted: backlinksList(
        first: ${EXTRACTED_PER_DEBATE}
        filter: {
          typeId: { is: "${SOURCES_PROPERTY_ID}" }
          fromEntity: { typeIds: { overlaps: ["${CLAIM_TYPE_ID}"] } }
        }
      ) {
        # No id: nothing downstream keys off an extracted claim, and leaving it out of a list this
        # long is 19 KB off a 20-card page.
        fromEntity {
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

  // Deduped by debate id, because a debate can carry more than one `Claims` relation to the same
  // claim and each is a separate backlink row. Observed on testnet: one debate linked a claim twice,
  // which counted its 22 extracted claims twice while the feed — which reads debates as entities —
  // drew it once.
  const debates = new Map<string, any>();
  for (const row of (raw.debates ?? raw.activityDebates ?? []) as Array<any>) {
    const debate = row?.fromEntity;
    if (debate?.id) debates.set(debate.id, debate);
  }

  let extractedClaims = 0;
  let debateComments = 0;
  for (const debate of debates.values()) {
    debateComments += commentsOf(debate);
    const listed = ((debate.extracted ?? []) as Array<any>).filter(row => row?.fromEntity);
    // The aggregate rather than the list's length: a truncated list still reports its true total,
    // and this number is the one the claim card prints.
    extractedClaims += debate.extractedCount?.totalCount ?? listed.length;
    for (const row of listed) {
      debateComments += commentsOf(row.fromEntity);
    }
  }

  return {
    comments: claimComments,
    debates: debates.size,
    extractedClaims,
    debateComments,
    total: claimComments + debates.size + extractedClaims + debateComments,
  };
}
