import { normId } from '~/core/utils/norm-id';

import { type ClaimOrderFacts, compareByRanking } from '../matchmaking/claim-order-facts';
import { type DebateAgendas, UNNAMED_AGENDA_SECTION } from './debate-agendas';
import { todaysSectionsInOrder } from './todays-claims-order';

/** The most claims the callout asks about in a day (GEO-3498). The rest stay in the Today's claims lists. */
export const CALLOUT_MAX_CLAIMS = 10;

/** At most this many of the day's set from one topic, so one story can't fill it (Geo Daily's rule). */
export const CALLOUT_MAX_PER_TOPIC = 3;

/** At most this many from one space, so the set reaches across the spaces with agendas. */
export const CALLOUT_MAX_PER_SPACE = 4;

/** One claim the callout asks about, with the agenda it was listed on, for its card's attribution. */
export type CalloutClaim = {
  claimId: string;
  spaceId: string;
  agendaId: string;
  sectionId: string;
  /**
   * What the topic cap counts by: the agenda section's heading, so the same story listed in two
   * spaces counts once, or the section's own id when it has no heading.
   */
  topic: string;
  /** The agenda's day (`YYYY-MM-DD`), for the card's attribution. */
  listedOn: string;
  /** Debates since the listing when the set was taken, when geo-chat could count them. */
  debatesSinceListing?: number;
};

/** One account's day, as the viewer's browser holds it, so the set outlives the panel closing and a reload. */
export type CalloutDay = {
  /** The agenda day the set was taken on. A newer agenda day starts a new set. */
  day: string;
  claims: CalloutClaim[];
  /** Claims answered from the callout, before geo-chat reports them. */
  answered: string[];
  skipped: string[];
  dismissed: boolean;
  /**
   * Whether the end card has been shown: nothing was left to ask. It stays for the visit it was
   * reached in, and is gone the next time the panel opens (Preston, 30 Oct).
   */
  ended?: boolean;
};

/**
 * Every space's current agenda, newest agenda day first, and each day in the order the lists draw
 * it (`todaysSectionsInOrder`); each claim once, at its newest listing. The newest day's agendas
 * are today's; a space whose current agenda is older follows them, so the callout can fill its set
 * from it when today's run short (`pickCalloutClaims`, GEO-3547). Earlier this week — agendas a
 * space has since replaced — is left out.
 */
export function todaysClaimsInOrder(
  agendas: DebateAgendas,
  spaceOrder: string[],
  debatesOf: (claimId: string) => number | undefined
): CalloutClaim[] {
  const days = [...new Set(agendas.spaces.map(space => space.listedOn))].sort().reverse();
  const seen = new Set<string>();
  return days
    .flatMap(day =>
      todaysSectionsInOrder(
        agendas.spaces.filter(space => space.listedOn === day),
        spaceOrder,
        debatesOf
      )
    )
    .flatMap(({ section, claimIds }) =>
      claimIds.flatMap(claimId => {
        if (seen.has(claimId)) return [];
        seen.add(claimId);
        const debates = debatesOf(claimId);
        return [
          {
            claimId,
            spaceId: section.spaceId,
            agendaId: section.agendaId,
            sectionId: section.id,
            topic: section.name === UNNAMED_AGENDA_SECTION ? section.id : section.name.trim().toLowerCase(),
            listedOn: section.listedOn,
            ...(debates === undefined ? {} : { debatesSinceListing: debates }),
          },
        ];
      })
    );
}

/**
 * The day's set: up to `CALLOUT_MAX_CLAIMS` of the agenda claims the viewer has not answered,
 * today's first. Only when today's agendas can't fill the set does it take from older ones, a day
 * at a time, newest first (Preston, 2 Nov) — so an older agenda never pushes out a claim of today's.
 * Within a day, claims from spaces the viewer is a member of come first (Preston, 2 Nov), then the rest; each
 * group highest-ranked first (`compareByRanking`, Explore's Best). Kept varied (Preston, 29 Oct): at
 * most `CALLOUT_MAX_PER_TOPIC` from one topic and `CALLOUT_MAX_PER_SPACE` from one space, so a
 * member space comes first in every pass but can't fill the set while other spaces have claims to
 * ask about. Only when the agendas can't fill the set that way are the caps relaxed, the space cap
 * first, so a day with one or two agendas still gets ten — and the relaxed passes take member
 * spaces' claims first too. Ties, and claims with no score, keep Today's claims order.
 */
export function pickCalloutClaims(
  ordered: CalloutClaim[],
  isAnswered: (claimId: string) => boolean,
  factsOf: (claimId: string) => ClaimOrderFacts | undefined,
  isMemberSpace: (spaceId: string) => boolean = () => false
): CalloutClaim[] {
  const memberFirst = (claim: CalloutClaim) => (isMemberSpace(claim.spaceId) ? 0 : 1);
  const ranked = ordered
    .map((claim, index) => ({ claim, index }))
    .filter(({ claim }) => !isAnswered(claim.claimId))
    .sort(
      (a, z) =>
        memberFirst(a.claim) - memberFirst(z.claim) ||
        compareByRanking(factsOf(a.claim.claimId), factsOf(z.claim.claimId)) ||
        a.index - z.index
    )
    .map(({ claim }) => claim);

  const picked = new Set<CalloutClaim>();
  const perTopic = new Map<string, number>();
  const perSpace = new Map<string, number>();
  const fill = (claims: CalloutClaim[], topicCap: number, spaceCap: number) => {
    for (const claim of claims) {
      if (picked.size >= CALLOUT_MAX_CLAIMS) return;
      const space = normId(claim.spaceId);
      if (picked.has(claim)) continue;
      if ((perTopic.get(claim.topic) ?? 0) >= topicCap || (perSpace.get(space) ?? 0) >= spaceCap) continue;
      picked.add(claim);
      perTopic.set(claim.topic, (perTopic.get(claim.topic) ?? 0) + 1);
      perSpace.set(space, (perSpace.get(space) ?? 0) + 1);
    }
  };
  // A day at a time, every pass of it before the next day's: the caps count across days, so an
  // older day's claims spread around the topics and spaces today's already took.
  const days = [...new Set(ranked.map(claim => claim.listedOn))].sort().reverse();
  const byDay = days.map(day => ranked.filter(claim => claim.listedOn === day));
  for (const claims of byDay) {
    fill(claims, CALLOUT_MAX_PER_TOPIC, CALLOUT_MAX_PER_SPACE);
    fill(claims, CALLOUT_MAX_PER_TOPIC, Infinity);
    fill(claims, Infinity, Infinity);
  }

  // Asked in that order — newest day, member spaces, then best first — whichever pass let a claim in.
  return byDay.flatMap(claims => claims.filter(claim => picked.has(claim)));
}

/**
 * Where the viewer is in the day's set: the claim to ask about now, or null once every claim has
 * been answered or skipped; whether each claim is answered, for the progress dots; and whether all
 * of them were, which is the only time the callout says the viewer is set for today.
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
