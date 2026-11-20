import { Effect } from 'effect';
import { privateKeyToAccount } from 'viem/accounts';

import type { DebateAcceptorConfig } from '~/core/debates/server/acceptor-config';
import { submitEditAsAcceptor } from '~/core/debates/server/publish-debate';
import { ID } from '~/core/id';
import { getEntity, getSpace } from '~/core/io/queries';
import { GEO_WEB_ORIGIN } from '~/core/sdk/geo-network';
import type { Entity } from '~/core/types';
import { Publish } from '~/core/utils/publish';

import { CURATOR_EVENT_TAKEN, findCuratorCallEvents, needsCuratorLookup } from './adopt';
import {
  type CallEventDraft,
  type GraphEntityForRemoval,
  buildCallEventDraft,
  buildCallEventRemoval,
  callPageUrl,
  mintedCallEntityId,
  updateChangesNothing,
} from './draft';
import { type CallEntityClaim, type CallEntityRecord, claimCallEntities, recordCallEntity } from './service';

/** One write is a proposal, a vote and maybe an execute. */
export const MAX_CALL_WRITES_PER_SWEEP = 4;
/** A backstop on claims per run, written or settled without an edit. */
const MAX_CALL_CLAIMS_PER_SWEEP = 20;
/** The claim route's cap on `space_ids`. */
const CLAIM_SPACE_LIMIT = 500;

/** A space the publisher cannot write to (not a DAO, gone) is held back a day, not dropped. */
const UNWRITABLE_SPACE_RETRY_S = 86_400;
/** A graph read that failed before anything was sent: try again on a near tick. */
const LOOKUP_RETRY_S = 300;
const ENTITY_NOT_INDEXED = 'entity_not_indexed';
/** Failed reads of a removal's entity before it counts as gone. */
const NOT_INDEXED_MAX_ATTEMPTS = 5;

export type CallEntitySweepResult = {
  skipped?: 'not_configured' | 'not_production' | 'no_web_origin';
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
  appOrigin?: string | null;
  mayWrite?: () => boolean;
  /** The chunk a run starts from, given the chunk count. */
  startChunk?: (chunkCount: number) => number;
};

const prepareOps = (draft: CallEventDraft, spaceId: string) =>
  Effect.runPromise(Publish.prepareLocalDataForPublishing(draft.values, draft.relations, spaceId));

const defaultLoadSpace = async (spaceId: string) => {
  const space = await Effect.runPromise(getSpace(spaceId));
  return space ? { id: space.id, type: space.type, address: space.address } : null;
};
const defaultStartChunk = (chunkCount: number) => Math.floor(Date.now() / 60_000) % chunkCount;
const defaultLoadEntity = (entityId: string, spaceId: string) => Effect.runPromise(getEntity(entityId, spaceId));

/** Production or off Vercel only, so a preview called by hand with its CRON_SECRET never writes. */
export function deploymentMayWrite(env: string | undefined = process.env.VERCEL_ENV): boolean {
  return env === undefined || env === '' || env === 'production';
}

function removalOf(entity: Entity, spaceId: string): GraphEntityForRemoval {
  const inSpace = (id: string) => ID.equals(id, spaceId);
  return {
    values: entity.values
      .filter(value => inSpace(value.spaceId))
      .map(value => ({ propertyId: value.property.id, dataType: value.property.dataType, value: value.value })),
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
 * this adds no gate of its own. Runs under the acceptor's signing lock.
 *
 * Each call is claimed just before it is written, so a run that stops early strands no claim. It is
 * written under one id: the one geo-chat recorded, else curator's event for the same slot, else the
 * call id. Every id inside the edit derives from it, so a retry after a lapsed claim rewrites the
 * same entity. The outcome is recorded back either way; a failure holds the call back.
 */
export async function sweepCallEntities(
  config: DebateAcceptorConfig,
  editorSpaceIds: string[],
  { canStart, deps = {} }: { canStart: () => boolean; deps?: Deps }
): Promise<CallEntitySweepResult> {
  const result: CallEntitySweepResult = { written: [], removed: [], failed: [], conflicts: [], claimLost: [] };
  if (!(deps.mayWrite ?? deploymentMayWrite)()) return { ...result, skipped: 'not_production' };
  const record = deps.record ?? recordCallEntity;
  const publisherAddress = privateKeyToAccount(config.privateKey).address;
  const appOrigin = deps.appOrigin === undefined ? GEO_WEB_ORIGIN : deps.appOrigin;
  if (!appOrigin) return { ...result, skipped: 'no_web_origin' };

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
      if (recorded.status === 'id_taken') {
        // Curator's event is another call's: fail so the next claim mints instead of adopting.
        // geo-chat then makes the holder rewrite its entity, so this claim only records failed.
        console.warn('[call-entities] adopted event belongs to another call', { callId });
        result.failed.push({ callId, error: CURATOR_EVENT_TAKEN });
        await record(claim.call_id, {
          claim_id: claim.claim_id,
          outcome: 'failed',
          error: CURATOR_EVENT_TAKEN,
        }).catch(error => console.error('[call-entities] could not record outcome', { callId, error: message(error) }));
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

  const spaces = new Map<string, Promise<SpaceInfo | null>>();
  const spaceOf = (spaceId: string) => {
    const key = ID.uuidToHex(spaceId);
    if (!spaces.has(key)) spaces.set(key, (deps.loadSpace ?? defaultLoadSpace)(key));
    return spaces.get(key)!;
  };

  /** Writes one claim; true when it sent an edit (time spent signing, whatever the outcome). */
  const writeOne = async (claim: CallEntityClaim): Promise<boolean> => {
    let signed = false;
    const callId = ID.uuidToHex(claim.call_id);
    // Unanswered, a claim that needs curator's event waits rather than minting a second entity.
    let curator: Map<string, string> | null = null;
    if (needsCuratorLookup(claim)) {
      try {
        curator = await (deps.findCurator ?? findCuratorCallEvents)([claim], {
          publisherAddress,
          pageUrlOf: c => callPageUrl(appOrigin, c.entity, c.call_id),
        });
      } catch (error) {
        console.error('[call-entities] curator event lookup failed', { callId, error: message(error) });
      }
    }

    if (needsCuratorLookup(claim) && curator === null) {
      await settle(claim, {
        claim_id: claim.claim_id,
        outcome: 'failed',
        error: 'curator_lookup_failed',
        retry_after_seconds: LOOKUP_RETRY_S,
      });
      return false;
    }

    const entityId = ID.uuidToHex(claim.entity_id ?? curator?.get(callId) ?? mintedCallEntityId(claim.call_id));
    if (claim.entity_id && updateChangesNothing(claim)) {
      await settle(claim, { claim_id: claim.claim_id, outcome: 'written', entity_id: entityId });
      return false;
    }
    try {
      const space = await spaceOf(claim.entity.space_id);
      if (!space || space.type !== 'DAO') {
        await settle(claim, {
          claim_id: claim.claim_id,
          outcome: 'failed',
          error: space ? 'space_not_dao' : 'space_not_found',
          retry_after_seconds: UNWRITABLE_SPACE_RETRY_S,
        });
        return false;
      }

      let current: Entity | null = null;
      if (claim.action === 'remove') {
        current = await (deps.loadEntity ?? defaultLoadEntity)(entityId, space.id);
        // geo-chat removes only what it recorded written, so a missing entity is the indexer lagging;
        // its backoff paces the retries.
        if (!current) {
          // Still unreadable after several tries: there is nothing on the graph to remove.
          const gaveUp = claim.last_error === ENTITY_NOT_INDEXED && claim.attempts >= NOT_INDEXED_MAX_ATTEMPTS;
          await settle(
            claim,
            gaveUp
              ? { claim_id: claim.claim_id, outcome: 'written', entity_id: entityId }
              : { claim_id: claim.claim_id, outcome: 'failed', error: ENTITY_NOT_INDEXED }
          );
          return false;
        }
      }
      const draft = current
        ? buildCallEventRemoval({
            claim,
            entityId,
            current: removalOf(current, space.id),
            publisherAddress,
            appOrigin,
          })
        : buildCallEventDraft({ claim, entityId, publisherAddress, appOrigin });

      const ops = await prepareOps(draft, ID.uuidToHex(space.id));
      // An entity with nothing left in this space has nothing to send.
      if (ops.length > 0) {
        signed = true;
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
    return signed;
  };

  // The claim route takes at most CLAIM_SPACE_LIMIT spaces; a chunk with nothing due is not asked again.
  const chunks: string[][] = [];
  const spaceIds = [...new Set(editorSpaceIds.map(id => ID.uuidToHex(id)))];
  for (let i = 0; i < spaceIds.length; i += CLAIM_SPACE_LIMIT) chunks.push(spaceIds.slice(i, i + CLAIM_SPACE_LIMIT));
  const drained = new Set<number>();
  // Each run starts at a different chunk, so a busy first chunk cannot starve the rest.
  const firstChunk = chunks.length > 0 ? (deps.startChunk ?? defaultStartChunk)(chunks.length) : 0;
  const claimNext = async (): Promise<CallEntityClaim | 'disabled' | null> => {
    for (let offset = 0; offset < chunks.length; offset += 1) {
      const index = (firstChunk + offset) % chunks.length;
      if (drained.has(index)) continue;
      const claims = await (deps.claim ?? claimCallEntities)(chunks[index]!, 1);
      if (claims === null) return 'disabled';
      if (claims[0]) return claims[0];
      drained.add(index);
    }
    return null;
  };

  // Only edits sent count against the write budget; claims settled without one are cheap.
  let writes = 0;
  for (let claimed = 0; writes < MAX_CALL_WRITES_PER_SWEEP && claimed < MAX_CALL_CLAIMS_PER_SWEEP; claimed += 1) {
    if (!canStart()) break;
    const claim = await claimNext();
    if (claim === 'disabled') return claimed === 0 ? { ...result, skipped: 'not_configured' } : result;
    if (!claim) break;
    if (await writeOne(claim)) writes += 1;
  }

  return result;
}
