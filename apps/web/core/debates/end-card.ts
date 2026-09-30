import { summarizeClaimResponses } from '~/core/claims/browse/claim-response-summary';
import type { ActiveResponseDirection } from '~/core/responses/entity-response';

/**
 * What the end card reads off the votes: how each debater's claims landed.
 *
 * Pure, so the arithmetic is tested without a query.
 */

export type ResponseTally = {
  counts: { positive: number; negative: number };
  responders: { userId: string; direction: ActiveResponseDirection }[];
};

export type ResponseSplit = ReturnType<typeof summarizeClaimResponses>;

/**
 * One debater's claims, pooled into a single split.
 *
 * Pooled rather than averaged: a claim eighty people answered and a claim two people answered are
 * not equally good evidence of how the room received someone, and averaging their shares would say
 * they were. Summing the responses weighs each claim by how many people actually judged it.
 *
 * Through `summarizeClaimResponses`, so the share and the floor mean exactly what they mean on every
 * other claim surface.
 */
export function poolResponses(tallies: ResponseTally[]): ResponseSplit {
  let positive = 0;
  let negative = 0;
  for (const tally of tallies) {
    positive += tally.counts.positive;
    negative += tally.counts.negative;
  }
  return summarizeClaimResponses(positive, negative);
}

/**
 * Everyone who answered any of these claims, once each, in the order they first appear.
 *
 * Distinct people, not responses: someone who answered all eight of a debater's claims is one face,
 * not eight.
 */
export function distinctResponders(tallies: ResponseTally[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const tally of tallies) {
    for (const responder of tally.responders) {
      if (!responder.userId || seen.has(responder.userId)) continue;
      seen.add(responder.userId);
      ordered.push(responder.userId);
    }
  }
  return ordered;
}
