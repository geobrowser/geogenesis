import { summarizeClaimResponses } from '~/core/claims/browse/claim-response-summary';
import type { ActiveResponseDirection } from '~/core/responses/entity-response';

/**
 * What the end card reads off the votes: how each debater's claims landed, and whether the room's
 * vote on the claim being debated points the same way as the claims it agreed with.
 *
 * Pure, so the arithmetic and every sentence it can produce are tested without a query.
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

/**
 * How many votes the claim and each debater need before the card compares them.
 *
 * Lower than `CLAIM_RESPONSE_FLOOR`'s 10, deliberately. That floor decides when a claim can be
 * called controversial across the whole platform, and it stays where it is. The comparison asks
 * three separate counts to clear it at once — the claim and both debaters — and at the platform's
 * current voting volume almost no debate would ever show one. Three is the least that is more than
 * one person's opinion on each side, and the sentence is read against faces that show how few
 * people it rests on.
 */
export const COMPARISON_VOTE_FLOOR = 3;

type Lean = 'agree' | 'disagree' | 'even';

export type ClaimVsArguments =
  /**
   * Not enough votes to say anything yet — see {@link COMPARISON_VOTE_FLOOR}. A state rather than
   * a guess: a gap between two percentages off one or two responses is noise drawn as a finding.
   */
  | { status: 'waiting' }
  | {
      status: 'ready';
      /** Share of the room agreeing with the claim being debated. */
      claimPercent: number;
      /** Where the agreement with the debaters' claims sits on the same scale, toward the Agree side. */
      argumentsPercent: number;
      /** Distance between the two, in points. */
      gap: number;
      claimLean: Lean;
      argumentsLean: Lean;
    };

function leanOf(percent: number): Lean {
  if (percent > 50) return 'agree';
  if (percent < 50) return 'disagree';
  return 'even';
}

/**
 * The vote on the claim, against the claims people agreed with, on one Agree-to-Disagree scale.
 *
 * The claim side is simply its share of agreement. The arguments side is each debater's pooled
 * agreement, weighed against the other's: 44% for the Agree-side debater and 71% for the
 * Disagree-side one puts 44 / (44 + 71) = 38% of the agreement on the Agree side. Both are then
 * positions on the same line, and the distance between them is what the card reports.
 *
 * Waits until the claim and both debaters have {@link COMPARISON_VOTE_FLOOR} votes each. The shares
 * themselves are shown at any count — that is Geo's rule everywhere, and the faces beside them say
 * how many people they are shares of — but comparing two of them is *characterising* the split, so
 * it needs something to stand on.
 */
export function claimVsArguments({
  claim,
  agreeSide,
  disagreeSide,
}: {
  claim: ResponseSplit;
  /** The pooled split on the claims of the debater who argued for the claim. */
  agreeSide: ResponseSplit;
  /** The same for the debater who argued against it. */
  disagreeSide: ResponseSplit;
}): ClaimVsArguments {
  const enough = (split: ResponseSplit) => split.total >= COMPARISON_VOTE_FLOOR;
  if (!enough(claim) || !enough(agreeSide) || !enough(disagreeSide)) return { status: 'waiting' };
  if (claim.percent === null || agreeSide.percent === null || disagreeSide.percent === null) {
    return { status: 'waiting' };
  }

  const weight = agreeSide.percent + disagreeSide.percent;
  // Nobody agreed with a single claim from either side. There is no lean to plot, and the honest
  // reading is that neither debater's arguments landed — the middle of the line, not a guess at it.
  const argumentsPercent = weight === 0 ? 50 : Math.round((100 * agreeSide.percent) / weight);
  const claimPercent = claim.percent;

  return {
    status: 'ready',
    claimPercent,
    argumentsPercent,
    gap: Math.abs(claimPercent - argumentsPercent),
    claimLean: leanOf(claimPercent),
    argumentsLean: leanOf(argumentsPercent),
  };
}

/**
 * The comparison in one sentence, for every combination of outcomes.
 *
 * "But" when the two point different ways, "and" when they agree — the conjunction is what tells a
 * reader whether the room is split with itself, so it is chosen rather than fixed. Names rather than
 * pronouns, which the card has no way to know.
 */
export function claimVsArgumentsReading(
  result: Extract<ClaimVsArguments, { status: 'ready' }>,
  { agreeName, disagreeName }: { agreeName: string; disagreeName: string }
): string {
  const claimPart =
    result.claimLean === 'agree'
      ? 'Most agree with the claim'
      : result.claimLean === 'disagree'
        ? 'Most disagree with the claim'
        : 'People are split on the claim';

  const conjunction = result.claimLean === result.argumentsLean ? 'and' : 'but';

  const argumentsPart =
    result.argumentsLean === 'agree'
      ? `found ${agreeName}'s arguments for it more convincing`
      : result.argumentsLean === 'disagree'
        ? `found ${disagreeName}'s arguments against it more convincing`
        : "found neither side's arguments more convincing";

  return `${claimPart}, ${conjunction} ${argumentsPart}.`;
}
