import { readEnv } from './acceptor-config';
import { upstashRedis } from './acceptor-lock';
import type { ClaimPublishCandidate } from './claim-publish-candidates';
import { DebateNotPublishableError } from './debate-source';
import {
  type PublishMissingDebateClaimsResult,
  lateClaimsLeaseKey,
  publishMissingDebateClaims,
} from './publish-missing-debate-claims';

/**
 * GEO-3635: the scheduled half of the late claims publish. Each tick of the early claims sweep, after
 * its own work, asks geo-chat which published debates have claims and when those were written, and
 * runs `publishMissingDebateClaims` unattended on the ones whose claims changed since this sweep
 * last finished them.
 *
 * A debate that waits or fails is backed off (10 minutes, an hour) so it does not take every tick's
 * checks ahead of the others.
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

/** How long a debate that waited (dedup, lease, indexing) is left alone before it is looked at again. */
export const LATE_CLAIMS_WAIT_BACKOFF_MS = 10 * 60 * 1000;
/** How long a debate whose publish failed is left alone, so a debate that always fails cannot starve the rest. */
export const LATE_CLAIMS_FAILURE_BACKOFF_MS = 60 * 60 * 1000;

export type LateClaimsMarkerStore = {
  /**
   * For each debate, in order: the `claims_generated_at` it was finished at, or null, and whether
   * it is backing off. One round trip per space.
   */
  read: (debateIds: string[]) => Promise<Array<{ finishedAt: string | null; deferred: boolean }>>;
  finish: (debateId: string, claimsGeneratedAt: string) => Promise<void>;
  defer: (debateId: string, ms: number) => Promise<void>;
  /** How long the debate's late-claims publish lease has left, in ms, or null when none is held. */
  leaseRemainingMs: (debateId: string) => Promise<number | null>;
};

const dashless = (id: string) => id.replace(/-/g, '').toLowerCase();

export function lateClaimsMarkerKey(debateId: string): string {
  return `debate-acceptor:late-claims-checked:${dashless(debateId)}`;
}

export function lateClaimsBackoffKey(debateId: string): string {
  return `debate-acceptor:late-claims-backoff:${dashless(debateId)}`;
}

export function upstashMarkerStore(): LateClaimsMarkerStore | null {
  // Raw strings: the marker is compared for equality with geo-chat's text and must come back as sent.
  const redis = upstashRedis({ automaticDeserialization: false });
  if (!redis) return null;
  return {
    read: async debateIds => {
      if (debateIds.length === 0) return [];
      const keys = debateIds.flatMap(id => [lateClaimsMarkerKey(id), lateClaimsBackoffKey(id)]);
      const values = await redis.mget<Array<string | null>>(...keys);
      return debateIds.map((_, index) => ({
        finishedAt: typeof values[2 * index] === 'string' ? (values[2 * index] as string) : null,
        deferred: values[2 * index + 1] !== null && values[2 * index + 1] !== undefined,
      }));
    },
    finish: async (debateId, claimsGeneratedAt) => {
      await redis.set(lateClaimsMarkerKey(debateId), claimsGeneratedAt);
    },
    defer: async (debateId, ms) => {
      await redis.set(lateClaimsBackoffKey(debateId), '1', { px: ms });
    },
    leaseRemainingMs: async debateId => {
      const ms = await redis.pttl(lateClaimsLeaseKey(debateId));
      return ms > 0 ? ms : null;
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
  deferred: number;
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
    deferred: 0,
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
    if (candidates.length === 0) continue;
    let markers: Awaited<ReturnType<LateClaimsMarkerStore['read']>>;
    try {
      markers = await deps.markers.read(candidates.map(candidate => candidate.debateId));
    } catch (error) {
      // Without the markers every debate would look changed: skip the space this tick.
      report.failed.push({
        debateId: `markers:${spaceId}`,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    for (const [index, candidate] of candidates.entries()) {
      if (!budget(spent)) break;
      const marker = markers[index];
      if (marker?.finishedAt === candidate.claimsGeneratedAt) {
        report.unchanged += 1;
        continue;
      }
      if (marker?.deferred) {
        report.deferred += 1;
        continue;
      }
      spent.checked += 1;
      try {
        const result = await deps.publish(candidate.debateId);
        if (result.status === 'published') {
          spent.submitted += 1;
          // Under its publish lease until the edit indexes: nothing to do until the lease lapses.
          await deferPastLease(deps.markers, candidate.debateId);
          report.published.push({
            debateId: candidate.debateId,
            statements: result.plan.statements.length,
            held: result.plan.held.length,
          });
        } else if (isFinished(result)) {
          report.finished += 1;
          await deps.markers.finish(candidate.debateId, candidate.claimsGeneratedAt);
        } else {
          report.waiting += 1;
          // An edit under its lease waits out what is left of the lease; anything else is a short wait.
          if (result.status === 'submission_pending') await deferPastLease(deps.markers, candidate.debateId);
          else await deps.markers.defer(candidate.debateId, LATE_CLAIMS_WAIT_BACKOFF_MS).catch(() => {});
        }
      } catch (error) {
        if (error instanceof DebateNotPublishableError) {
          report.waiting += 1;
          await deps.markers.defer(candidate.debateId, LATE_CLAIMS_WAIT_BACKOFF_MS).catch(() => {});
          continue;
        }
        // Backed off for an hour, so a debate that always fails does not take every tick's checks.
        await deps.markers.defer(candidate.debateId, LATE_CLAIMS_FAILURE_BACKOFF_MS).catch(() => {});
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

/** Back a debate off for what is left of its publish lease, or the short wait when that is unknown. */
async function deferPastLease(markers: LateClaimsMarkerStore, debateId: string): Promise<void> {
  const remaining = await markers.leaseRemainingMs(debateId).catch(() => null);
  await markers.defer(debateId, remaining ?? LATE_CLAIMS_WAIT_BACKOFF_MS).catch(() => {});
}

export const defaultLateClaimsPublish = (debateId: string) =>
  publishMissingDebateClaims(debateId, { dryRun: false, unattended: true, blockText: 'keep' });
