import { normId } from '~/core/utils/norm-id';

import type { DebateAgendas } from './debate-agendas';
import { orderByDebatesSinceListing } from './todays-claims-order';

/** The most claims the callout asks about in a day (GEO-3498). The rest stay in the Today's claims lists. */
export const CALLOUT_MAX_CLAIMS = 10;

/** One claim the callout asks about, with the agenda it was listed on, for its card's attribution. */
export type CalloutClaim = {
  claimId: string;
  spaceId: string;
  agendaId: string;
  sectionId: string;
  listedAt: string;
  /** Debates since the listing when the set was taken, when geo-chat could count them. */
  debatesSinceListing?: number;
};

/** The day's set as the viewer's browser holds it, so the panel and the hub walk the same one. */
export type CalloutDay = {
  accountKey: string | null;
  /** The agenda day the set was taken on. A newer agenda day starts a new set. */
  day: string | null;
  claims: CalloutClaim[];
  /** Claims answered from the callout, before geo-chat reports them. */
  answered: string[];
  skipped: string[];
  dismissed: boolean;
};

/**
 * Today's claims in the order the lists draw them: spaces in `spaceOrder` (member spaces first),
 * each space's sections in agenda order, and inside a section the claims nobody has debated since
 * the listing ahead of the debated ones. Each claim once, at its first place. Earlier this week is
 * left out: the callout is about today's agendas.
 */
export function todaysClaimsInOrder(
  agendas: DebateAgendas,
  spaceOrder: string[],
  debatesOf: (claimId: string) => number | undefined
): CalloutClaim[] {
  const seen = new Set<string>();
  const out: CalloutClaim[] = [];
  for (const spaceId of spaceOrder) {
    const space = agendas.spaces.find(candidate => normId(candidate.spaceId) === normId(spaceId));
    for (const section of space?.sections ?? []) {
      for (const claimId of orderByDebatesSinceListing(section.claimIds, debatesOf)) {
        if (seen.has(claimId)) continue;
        seen.add(claimId);
        const debates = debatesOf(claimId);
        out.push({
          claimId,
          spaceId: section.spaceId,
          agendaId: section.agendaId,
          sectionId: section.id,
          listedAt: section.listedAt,
          ...(debates === undefined ? {} : { debatesSinceListing: debates }),
        });
      }
    }
  }
  return out;
}

/** The first `CALLOUT_MAX_CLAIMS` the viewer has not answered: the day's set. */
export function pickCalloutClaims(ordered: CalloutClaim[], isAnswered: (claimId: string) => boolean): CalloutClaim[] {
  return ordered.filter(claim => !isAnswered(claim.claimId)).slice(0, CALLOUT_MAX_CLAIMS);
}

/**
 * Where the viewer is in the day's set: the claim to ask about now, or null once every claim has
 * been answered or skipped, and whether each claim is answered, for the progress dots.
 */
export function calloutStep(
  day: Pick<CalloutDay, 'claims' | 'answered' | 'skipped'>,
  answeredElsewhere: (claimId: string) => boolean
) {
  const answered = new Set(day.answered);
  const skipped = new Set(day.skipped);
  const isAnswered = (claimId: string) => answered.has(claimId) || answeredElsewhere(claimId);
  const done = day.claims.map(claim => isAnswered(claim.claimId));
  const currentIndex = day.claims.findIndex((claim, index) => !done[index] && !skipped.has(claim.claimId));
  return {
    current: currentIndex === -1 ? null : day.claims[currentIndex]!,
    currentIndex,
    done,
    allAnswered: done.length > 0 && done.every(Boolean),
  };
}
