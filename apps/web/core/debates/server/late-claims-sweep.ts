import { Redis } from '@upstash/redis';

import { readEnv } from './acceptor-config';
import type { ClaimPublishCandidate } from './claim-publish-candidates';
import { DebateNotPublishableError } from './debate-source';
import { type PublishMissingDebateClaimsResult, publishMissingDebateClaims } from './publish-missing-debate-claims';

/**
 * GEO-3635: the scheduled half of the late claims publish. Each tick of the early claims sweep, after
 * its own work, asks geo-chat which published debates have claims and when those were written, and
 * runs `publishMissingDebateClaims` unattended on the ones whose claims changed since this sweep
 * last finished them.
 *
 * "Finished" is a per-debate marker in Upstash holding the `claims_generated_at` it was finished at,
 * compared as geo-chat's exact string. A debate is marked only when nothing more can come of it
 * until geo-chat rewrites its claims: up to date (holds, skips and turn moves included, which only a
 * person or a rewrite changes), no claims, or a space the acceptor cannot edit. Never on a wait
 * (dedup pending, an edit still under its lease, the Debate entity not indexed yet) or a failure,
 * which the next tick retries. After a publish it is not marked either: the next ticks find the
 * lease, and once that lapses the re-plan comes back up to date and marks it.
 *
 * Off unless `DEBATE_LATE_CLAIM_SWEEP_ENABLED` is set: it starts publishing on its own, so it is
 * switched on after the reviewed one-off has run (Preston, 13 Nov). Without Upstash it does not run
 * at all, since without the marker it would re-read every published debate on every tick.
 */

export function isLateClaimSweepEnabled(): boolean {
  return /^(true|1|yes|on)$/i.test(readEnv('DEBATE_LATE_CLAIM_SWEEP_ENABLED'));
}

export type LateClaimsMarkerStore = {
  get: (debateId: string) => Promise<string | null>;
  set: (debateId: string, claimsGeneratedAt: string) => Promise<void>;
};

export function lateClaimsMarkerKey(debateId: string): string {
  return `debate-acceptor:late-claims-checked:${debateId.replace(/-/g, '').toLowerCase()}`;
}

export function upstashMarkerStore(): LateClaimsMarkerStore | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const redis = new Redis({ url, token, retry: { retries: 1 }, automaticDeserialization: false });
  return {
    get: async debateId => {
      const value = await redis.get<string>(lateClaimsMarkerKey(debateId));
      return typeof value === 'string' ? value : null;
    },
    set: async (debateId, claimsGeneratedAt) => {
      await redis.set(lateClaimsMarkerKey(debateId), claimsGeneratedAt);
    },
  };
}

/** Whether a result means nothing more can happen for this debate until its claims are rewritten. */
export function isFinished(result: PublishMissingDebateClaimsResult): boolean {
  return result.status === 'up_to_date' || result.status === 'no_claims' || result.status === 'not_editor';
}

export type LateClaimsSweepDeps = {
  listCandidates: (spaceId: string) => Promise<ClaimPublishCandidate[] | null>;
  markers: LateClaimsMarkerStore;
  publish: (debateId: string) => Promise<PublishMissingDebateClaimsResult>;
};

export type LateClaimsSweepReport = {
  published: Array<{ debateId: string; statements: number; held: number }>;
  finished: number;
  waiting: number;
  unchanged: number;
  failed: Array<{ debateId: string; error: string }>;
  /** geo-chat has no candidates endpoint yet. */
  unsupported: boolean;
};

/**
 * One pass over the editor spaces. `budget` decides, before each debate, whether there is time and
 * room left: `checked` counts debates looked at (each costs a handful of reads), `submitted` counts
 * edits sent.
 */
export async function runLateClaimsSweep(
  spaceIds: string[],
  budget: (spent: { checked: number; submitted: number }) => boolean,
  deps: LateClaimsSweepDeps
): Promise<LateClaimsSweepReport> {
  const report: LateClaimsSweepReport = {
    published: [],
    finished: 0,
    waiting: 0,
    unchanged: 0,
    failed: [],
    unsupported: false,
  };
  const spent = { checked: 0, submitted: 0 };
  for (const spaceId of spaceIds) {
    if (!budget(spent)) break;
    let candidates: ClaimPublishCandidate[] | null;
    try {
      candidates = await deps.listCandidates(spaceId);
    } catch (error) {
      report.failed.push({
        debateId: `space:${spaceId}`,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (candidates === null) {
      report.unsupported = true;
      break;
    }
    for (const candidate of candidates) {
      if (!budget(spent)) break;
      const marker = await deps.markers.get(candidate.debateId).catch(() => null);
      if (marker === candidate.claimsGeneratedAt) {
        report.unchanged += 1;
        continue;
      }
      spent.checked += 1;
      try {
        const result = await deps.publish(candidate.debateId);
        if (result.status === 'published') {
          spent.submitted += 1;
          report.published.push({
            debateId: candidate.debateId,
            statements: result.plan.statements.length,
            held: result.plan.held.length,
          });
        } else if (isFinished(result)) {
          report.finished += 1;
          await deps.markers.set(candidate.debateId, candidate.claimsGeneratedAt);
        } else {
          report.waiting += 1;
        }
      } catch (error) {
        if (error instanceof DebateNotPublishableError) {
          report.waiting += 1;
          continue;
        }
        spent.submitted += 1; // a failure may have spent the time a submit would
        console.error(`[debate-acceptor] late claims publish failed for debate ${candidate.debateId}:`, error);
        report.failed.push({
          debateId: candidate.debateId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return report;
}

export const defaultLateClaimsPublish = (debateId: string) =>
  publishMissingDebateClaims(debateId, { dryRun: false, unattended: true, blockText: 'keep' });
