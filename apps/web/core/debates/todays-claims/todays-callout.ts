import { normId } from '~/core/utils/norm-id';

import type { DebateAgendas } from './debate-agendas';
import { orderByDebatesSinceListing } from './todays-claims-order';

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
  /** The agenda section's heading: its topic. */
  topic: string;
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
          topic: section.name,
          listedAt: section.listedAt,
          ...(debates === undefined ? {} : { debatesSinceListing: debates }),
        });
      }
    }
  }
  return out;
}

/**
 * The day's set: up to `CALLOUT_MAX_CLAIMS` of today's agenda claims the viewer has not answered,
 * the highest-ranked first, kept varied (Preston, 29 Oct): at most `CALLOUT_MAX_PER_TOPIC` from one
 * topic and `CALLOUT_MAX_PER_SPACE` from one space. Only when the agendas can't fill the set that
 * way are the caps relaxed, the space cap first, so a day with one or two agendas still gets ten.
 *
 * A topic is the agenda section's heading, so the same story listed in two spaces counts once. A
 * claim with no score ranks below every scored one; ties, and claims with no score at all, keep
 * their Today's claims order, member spaces first.
 */
export function pickCalloutClaims(
  ordered: CalloutClaim[],
  isAnswered: (claimId: string) => boolean,
  scoreOf: (claimId: string) => number | null | undefined
): CalloutClaim[] {
  const ranked = ordered
    .map((claim, index) => ({ claim, index, score: scoreOf(claim.claimId) ?? null }))
    .filter(({ claim }) => !isAnswered(claim.claimId))
    .sort((a, z) => {
      if (a.score === z.score) return a.index - z.index;
      if (a.score === null) return 1;
      if (z.score === null) return -1;
      return z.score - a.score || a.index - z.index;
    })
    .map(({ claim }) => claim);

  const picked: CalloutClaim[] = [];
  const perTopic = new Map<string, number>();
  const perSpace = new Map<string, number>();
  const topicOf = (claim: CalloutClaim) => claim.topic.trim().toLowerCase();
  const fill = (topicCap: number, spaceCap: number) => {
    for (const claim of ranked) {
      if (picked.length >= CALLOUT_MAX_CLAIMS) return;
      if (picked.includes(claim)) continue;
      const topic = topicOf(claim);
      const space = normId(claim.spaceId);
      if ((perTopic.get(topic) ?? 0) >= topicCap || (perSpace.get(space) ?? 0) >= spaceCap) continue;
      picked.push(claim);
      perTopic.set(topic, (perTopic.get(topic) ?? 0) + 1);
      perSpace.set(space, (perSpace.get(space) ?? 0) + 1);
    }
  };
  fill(CALLOUT_MAX_PER_TOPIC, CALLOUT_MAX_PER_SPACE);
  fill(CALLOUT_MAX_PER_TOPIC, Infinity);
  fill(Infinity, Infinity);

  // Asked best first, whichever pass let a claim in.
  return ranked.filter(claim => picked.includes(claim));
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
