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
 * Today's claims in the order the lists draw them (`todaysSectionsInOrder`), each claim once at its
 * first place. Only agendas from the newest agenda day: a space that last published days ago, and
 * Earlier this week, are left out, so the callout asks about today's agendas.
 */
export function todaysClaimsInOrder(
  agendas: DebateAgendas,
  spaceOrder: string[],
  debatesOf: (claimId: string) => number | undefined
): CalloutClaim[] {
  const today = agendas.spaces.filter(space => space.listedOn === agendas.newestDay);
  const seen = new Set<string>();
  return todaysSectionsInOrder(today, spaceOrder, debatesOf).flatMap(({ section, claimIds }) =>
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
 * The day's set: up to `CALLOUT_MAX_CLAIMS` of today's agenda claims the viewer has not answered,
 * the highest-ranked first (`compareByRanking`, Explore's Best), kept varied (Preston, 29 Oct): at
 * most `CALLOUT_MAX_PER_TOPIC` from one topic and `CALLOUT_MAX_PER_SPACE` from one space. Only when
 * the agendas can't fill the set that way are the caps relaxed, the space cap first, so a day with
 * one or two agendas still gets ten. Ties, and claims with no score, keep Today's claims order.
 */
export function pickCalloutClaims(
  ordered: CalloutClaim[],
  isAnswered: (claimId: string) => boolean,
  factsOf: (claimId: string) => ClaimOrderFacts | undefined
): CalloutClaim[] {
  const ranked = ordered
    .map((claim, index) => ({ claim, index }))
    .filter(({ claim }) => !isAnswered(claim.claimId))
    .sort((a, z) => compareByRanking(factsOf(a.claim.claimId), factsOf(z.claim.claimId)) || a.index - z.index)
    .map(({ claim }) => claim);

  const picked = new Set<CalloutClaim>();
  const perTopic = new Map<string, number>();
  const perSpace = new Map<string, number>();
  const fill = (topicCap: number, spaceCap: number) => {
    for (const claim of ranked) {
      if (picked.size >= CALLOUT_MAX_CLAIMS) return;
      const space = normId(claim.spaceId);
      if (picked.has(claim)) continue;
      if ((perTopic.get(claim.topic) ?? 0) >= topicCap || (perSpace.get(space) ?? 0) >= spaceCap) continue;
      picked.add(claim);
      perTopic.set(claim.topic, (perTopic.get(claim.topic) ?? 0) + 1);
      perSpace.set(space, (perSpace.get(space) ?? 0) + 1);
    }
  };
  fill(CALLOUT_MAX_PER_TOPIC, CALLOUT_MAX_PER_SPACE);
  fill(CALLOUT_MAX_PER_TOPIC, Infinity);
  fill(Infinity, Infinity);

  // Asked best first, whichever pass let a claim in.
  return ranked.filter(claim => picked.has(claim));
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
