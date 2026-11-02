import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import type { ExploreWindowReorder } from '~/core/explore/fetch-explore-feed';
import { normId } from '~/core/utils/norm-id';

import { BEST_FEED_VERSION, type FeedDescriptor, forYouFeedVersion } from './feed-version';
import { type GaiaForYouResponse, fetchGaiaForYou } from './gaia-for-you';
import { hashSeed, seededRandom, teamDraftInterleave } from './team-draft-interleave';

/**
 * The window hook behind Explore's For you and interleaved pages (GEO-3140, GEO-3144).
 *
 * One gaia call per window: it re-orders Best's candidates for the user and says whether the user
 * is in a feed experiment's interleaved group. From that:
 *
 *   - Interleaved group (and interleaving switched on): each of the experiment's two versions
 *     orders the window, each through Best's own diversity pass; team-draft interleaving merges
 *     them; the diversity pass runs once more so the merged page keeps the type mix. Every card
 *     records the version and arm that picked it.
 *   - For you requested and the user has interest weights: gaia's order, through the diversity pass.
 *   - Anything else (Best requested, no weights, gaia off or failing): null, which serves Best.
 */

type Arm = 'best' | 'for-you';

/**
 * Users gaia last said are NOT in an interleaved group. A Best request from one of them skips the
 * gaia call for this long, so switching interleaving on does not add a round trip to every
 * signed-in Best page. It is also how long a change to who is in the group takes to reach them.
 */
export const NOT_INTERLEAVED_TTL_MS = 5 * 60_000;
const notInterleaved = new Map<string, number>();

export function resetInterleavingCacheForTests() {
  notInterleaved.clear();
}

/** Rows in gaia's order, already-answered ones dropped, each annotated with its reason and score. */
export function applyForYouOrder(
  rows: readonly ExploreFeedRow[],
  response: GaiaForYouResponse,
  version: string
): ExploreFeedRow[] {
  const byId = new Map(rows.map(row => [normId(row.entityId), row]));
  const excluded = new Set(response.excluded.map(e => normId(e.entityId)));
  const out: ExploreFeedRow[] = [];
  const placed = new Set<string>();
  for (const item of response.items) {
    const key = normId(item.entityId);
    const row = byId.get(key);
    if (!row || placed.has(key)) continue;
    placed.add(key);
    out.push({
      ...row,
      ranking: {
        version,
        reason: item.reason,
        score: item.score,
        exploration: item.exploration,
        explorationProbability: item.explorationProbability,
      },
    });
  }
  // Anything gaia did not mention keeps Best's order at the end; nothing is silently lost.
  for (const row of rows) {
    const key = normId(row.entityId);
    if (!placed.has(key) && !excluded.has(key)) out.push({ ...row, ranking: { version } });
  }
  return out;
}

const tag = (rows: readonly ExploreFeedRow[], version: string) => rows.map(row => ({ ...row, ranking: { version } }));

export function createPersonalizedWindowReorder(args: {
  /** The viewer's personal space id, derived server-side from a verified identity token. */
  userId: string;
  requested: Arm;
  /** Pinned per scroll, so every page of it reads interests at the same moment. */
  asOf: string;
  interleavingEnabled: boolean;
  fetchForYou?: typeof fetchGaiaForYou;
}): ExploreWindowReorder {
  const fetchForYou = args.fetchForYou ?? fetchGaiaForYou;
  return async (rows, { windowKey, arrange }) => {
    if (rows.length === 0) return null;
    if (args.requested === 'best') {
      const until = notInterleaved.get(args.userId);
      if (!args.interleavingEnabled || (until !== undefined && until > Date.now())) return null;
    }
    const response = await fetchForYou({
      userId: args.userId,
      candidateIds: rows.map(row => normId(row.entityId)),
      asOf: args.asOf,
    });
    if (!response) return null;

    const forYouVersion = forYouFeedVersion(response.ranking.version);
    const forYouRows = response.personalized ? applyForYouOrder(rows, response, forYouVersion) : null;

    const experiment = response.experiment;
    const arms = experiment?.arms.filter((arm): arm is Arm => arm === 'best' || arm === 'for-you') ?? [];
    if (args.interleavingEnabled && experiment?.interleaved && arms.length === 2) {
      const versionOf = (arm: Arm) => (arm === 'for-you' ? forYouVersion : BEST_FEED_VERSION);
      // A user with no weights gets Best from the For you arm too, still credited to For you: that
      // is what For you serves them.
      const listOf = (arm: Arm) =>
        arm === 'for-you' && forYouRows ? arrange(forYouRows) : tag(arrange(rows), versionOf(arm));
      const [armA, armB] = arms as [Arm, Arm];
      const merged = teamDraftInterleave(
        listOf(armA),
        listOf(armB),
        row => normId(row.entityId),
        seededRandom(hashSeed(`${args.userId}:${windowKey}:${args.asOf}:${experiment.id}`))
      );
      const versions = { a: versionOf(armA), b: versionOf(armB) };
      const feed: FeedDescriptor = {
        name: 'interleaved',
        version: `interleave(${versions.a},${versions.b})`,
        experimentId: experiment.id,
        arms: versions,
      };
      return {
        feed,
        rows: arrange(
          merged.map(({ item, arm }) => ({
            ...item,
            ranking: { ...item.ranking, version: versions[arm], arm, experimentId: experiment.id },
          }))
        ),
      };
    }

    if (args.requested === 'best') {
      if (notInterleaved.size > 10_000) notInterleaved.clear();
      notInterleaved.set(args.userId, Date.now() + NOT_INTERLEAVED_TTL_MS);
    }
    if (args.requested === 'for-you' && forYouRows) {
      return { rows: arrange(forYouRows), feed: { name: 'for-you', version: forYouVersion } };
    }
    return null;
  };
}
