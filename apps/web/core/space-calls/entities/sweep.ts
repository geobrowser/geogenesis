import { Effect } from 'effect';
import { privateKeyToAccount } from 'viem/accounts';

import { GEO_CANONICAL_ORIGIN } from '~/core/constants';
import type { DebateAcceptorConfig } from '~/core/debates/server/acceptor-config';
import { submitEditAsAcceptor } from '~/core/debates/server/publish-debate';
import { ID } from '~/core/id';
import { getEntity, getSpace } from '~/core/io/queries';
import type { Entity } from '~/core/types';
import { Publish } from '~/core/utils/publish';

import { findCuratorCallEvents, needsCuratorLookup } from './adopt';
import {
  type CallEventDraft,
  type GraphEntityForRemoval,
  buildCallEventDraft,
  buildCallEventRemoval,
  mintedCallEntityId,
} from './draft';
import { type CallEntityClaim, type CallEntityRecord, claimCallEntities, recordCallEntity } from './service';

/** One write is a proposal, a vote and maybe an execute. Unstarted claims lapse in 15 minutes. */
export const MAX_CALL_WRITES_PER_SWEEP = 4;

/** A space the publisher cannot write to (not a DAO, gone) is held back a day, not dropped. */
const UNWRITABLE_SPACE_RETRY_S = 86_400;
/** A graph read that failed before anything was sent: try again on a near tick. */
const LOOKUP_RETRY_S = 300;

export type CallEntitySweepResult = {
  skipped?: 'not_configured' | 'not_production';
  written: string[];
  removed: string[];
  failed: Array<{ callId: string; error: string }>;
  /** Recorded under a different id by another write; nothing more to do. */
  conflicts: string[];
  claimLost: string[];
};

type SpaceInfo = { id: string; type: string; address: string };

type Deps = {
  claim?: typeof claimCallEntities;
  record?: typeof recordCallEntity;
  findCurator?: typeof findCuratorCallEvents;
  loadSpace?: (spaceId: string) => Promise<SpaceInfo | null>;
  loadEntity?: (entityId: string, spaceId: string) => Promise<Entity | null>;
  submit?: (
    config: DebateAcceptorConfig,
    edit: { name: string; ops: Awaited<ReturnType<typeof prepareOps>>; space: SpaceInfo }
  ) => Promise<string>;
  appOrigin?: string;
  mayWrite?: () => boolean;
};

const prepareOps = (draft: CallEventDraft, spaceId: string) =>
  Effect.runPromise(Publish.prepareLocalDataForPublishing(draft.values, draft.relations, spaceId));

const defaultLoadSpace = async (spaceId: string) => {
  const space = await Effect.runPromise(getSpace(spaceId));
  return space ? { id: space.id, type: space.type, address: space.address } : null;
};
const defaultLoadEntity = (entityId: string, spaceId: string) => Effect.runPromise(getEntity(entityId, spaceId));

/**
 * Writes run from the production deployment only: Vercel fires the cron there alone, and this keeps
 * a preview that someone calls by hand with its CRON_SECRET from writing. Off Vercel (local
 * rehearsal) it runs.
 */
export function deploymentMayWrite(env: string | undefined = process.env.VERCEL_ENV): boolean {
  return env === undefined || env === '' || env === 'production';
}

function removalOf(entity: Entity | null, spaceId: string): GraphEntityForRemoval {
  if (!entity) return { values: [], relations: [] };
  const inSpace = (id: string) => ID.equals(id, spaceId);
  return {
    values: entity.values
      .filter(value => inSpace(value.spaceId))
      .map(value => ({ propertyId: value.property.id, dataType: value.property.dataType })),
    relations: entity.relations
      .filter(relation => inSpace(relation.spaceId))
      .map(relation => ({
        id: relation.id,
        entityId: relation.entityId,
        typeId: relation.type.id,
        toEntityId: relation.toEntity.id,
      })),
  };
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Writes the Call Event entities geo-chat says are due (GEO-3593), as the debate acceptor, in the
 * spaces it edits. geo-chat decides which calls are listed (its switch, space allowlist and cutoff);
 * this adds no gate of its own. Runs under the acceptor's signing lock, after the debate sweep.
 *
 * Each claim is written under one id: the one geo-chat recorded, else curator's event for the same
 * slot, else the call id. Every id inside the edit derives from it, so a retry after a lapsed claim
 * rewrites the same entity. The outcome is recorded back either way; a failure holds the call back.
 */
export async function sweepCallEntities(
  config: DebateAcceptorConfig,
  editorSpaceIds: string[],
  { canStart, deps = {} }: { canStart: () => boolean; deps?: Deps }
): Promise<CallEntitySweepResult> {
  const result: CallEntitySweepResult = { written: [], removed: [], failed: [], conflicts: [], claimLost: [] };
  if (!(deps.mayWrite ?? deploymentMayWrite)()) return { ...result, skipped: 'not_production' };
  if (!canStart()) return result;

  const claims = await (deps.claim ?? claimCallEntities)(editorSpaceIds, MAX_CALL_WRITES_PER_SWEEP);
  if (claims === null) return { ...result, skipped: 'not_configured' };
  if (claims.length === 0) return result;

  const record = deps.record ?? recordCallEntity;
  const publisherAddress = privateKeyToAccount(config.privateKey).address;
  const appOrigin = deps.appOrigin ?? GEO_CANONICAL_ORIGIN;

  const settle = async (claim: CallEntityClaim, outcome: CallEntityRecord) => {
    const callId = ID.uuidToHex(claim.call_id);
    try {
      const recorded = await record(claim.call_id, outcome);
      if (recorded.status === 'id_conflict') {
        console.warn('[call-entities] call already recorded under another entity', {
          callId,
          recorded: recorded.entityId,
          attempted: outcome.outcome === 'written' ? outcome.entity_id : null,
        });
        result.conflicts.push(callId);
        return;
      }
      if (recorded.status === 'claim_lost') {
        result.claimLost.push(callId);
        return;
      }
    } catch (error) {
      // The claim lapses and the call is claimed again; derived ids make the rewrite harmless.
      console.error('[call-entities] could not record outcome', { callId, error: message(error) });
    }
    if (outcome.outcome === 'failed') result.failed.push({ callId, error: outcome.error });
    else if (claim.action === 'remove') result.removed.push(callId);
    else result.written.push(callId);
  };

  // Curator's events, found once per series. Unanswered, a claim that needs it waits rather than
  // minting a second entity for the same occurrence.
  let curator: Map<string, string> | null;
  try {
    curator = await (deps.findCurator ?? findCuratorCallEvents)(claims);
  } catch (error) {
    console.error('[call-entities] curator event lookup failed', { error: message(error) });
    curator = null;
  }

  const spaces = new Map<string, Promise<SpaceInfo | null>>();
  const spaceOf = (spaceId: string) => {
    const key = ID.uuidToHex(spaceId);
    if (!spaces.has(key)) spaces.set(key, (deps.loadSpace ?? defaultLoadSpace)(key));
    return spaces.get(key)!;
  };

  for (const claim of claims) {
    const callId = ID.uuidToHex(claim.call_id);
    if (!canStart()) {
      // Left to lapse: recording a failure would count against the call for no fault of its own.
      continue;
    }

    if (needsCuratorLookup(claim) && curator === null) {
      await settle(claim, {
        claim_id: claim.claim_id,
        outcome: 'failed',
        error: 'curator_lookup_failed',
        retry_after_seconds: LOOKUP_RETRY_S,
      });
      continue;
    }

    const entityId = ID.uuidToHex(claim.entity_id ?? curator?.get(callId) ?? mintedCallEntityId(claim.call_id));
    try {
      const space = await spaceOf(claim.entity.space_id);
      if (!space || space.type !== 'DAO') {
        await settle(claim, {
          claim_id: claim.claim_id,
          outcome: 'failed',
          error: space ? 'space_not_dao' : 'space_not_found',
          retry_after_seconds: UNWRITABLE_SPACE_RETRY_S,
        });
        continue;
      }

      const draft =
        claim.action === 'remove'
          ? buildCallEventRemoval({
              claim,
              entityId,
              current: removalOf(await (deps.loadEntity ?? defaultLoadEntity)(entityId, space.id), space.id),
            })
          : buildCallEventDraft({ claim, entityId, publisherAddress, appOrigin });

      const ops = await prepareOps(draft, ID.uuidToHex(space.id));
      // A removal of an entity the graph no longer holds has nothing to send.
      if (ops.length > 0) {
        await (deps.submit ?? submitEditAsAcceptor)(config, {
          name: claim.action === 'remove' ? `Remove call: ${draft.name}` : `Call: ${draft.name}`,
          ops,
          space,
        });
      }
      console.log('[call-entities] wrote call entity', { callId, entityId, action: claim.action });
      await settle(claim, { claim_id: claim.claim_id, outcome: 'written', entity_id: entityId });
    } catch (error) {
      console.error('[call-entities] call entity write failed', { callId, entityId, error: message(error) });
      await settle(claim, { claim_id: claim.claim_id, outcome: 'failed', error: message(error) });
    }
  }

  return result;
}
