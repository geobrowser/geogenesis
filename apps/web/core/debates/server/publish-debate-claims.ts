import type { Op } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import { uuidToHex } from '~/core/id/normalize';
import { getEntity } from '~/core/io/queries';
import { Publish } from '~/core/utils/publish';

import type { Debate } from '../api';
import { type DebateClaimInput, type DebatePublishTurn, buildDebateClaimsDraft } from '../debate-publish-draft';
import { type DebateAcceptorConfig, getDebateAcceptorConfig, readEnv } from './acceptor-config';
import { type ExistingClaimLookup, applyClaimReusePolicy, lookupExistingClaimsInGraph } from './claim-reuse';
import { loadDebateClaims, loadSettledDebate } from './debate-source';
import { loadAcceptorEditableSpace, submitEditAsAcceptor } from './publish-debate';

/**
 * GEO-2870 option A (Preston, 2026-10-05): a debate's extracted claims go onto the graph as soon as
 * geo-chat has them, under the stable ids it minted (D1), so people can take a side on them and
 * request debates on them minutes after the debate ends rather than when the whole debate publishes
 * (~27 minutes, gated on the composed video).
 *
 * Same publisher, space and signer as the full debate publish — the acceptor, into the debated
 * claim's space — and the same opt-out gate: nothing is published before the recording can no longer
 * be cancelled. Incremental: each run publishes only the stable ids the graph does not have yet, so
 * a claims list that grows (per-turn extraction, a re-extraction) publishes its new claims and
 * nothing twice. The full publish later writes the same claims again with the same relation ids
 * (`stableClaimRelationIds`), which updates rather than duplicates.
 */
export type PublishDebateClaimsResult =
  | { status: 'published'; spaceId: string; claimIds: string[]; userOpHash: string }
  /** Every claim it would write is already on the graph. */
  | { status: 'up_to_date'; spaceId: string }
  /** No claims yet, or none that would be minted (all matched to existing entities, or pre-D1). */
  | { status: 'no_claims' }
  /** The Debate entity exists: the full publish has run and wrote the claims itself. */
  | { status: 'debate_published' }
  | { status: 'not_editor'; spaceId: string }
  | { status: 'acceptor_not_configured' };

/** On unless `DEBATE_EARLY_CLAIM_PUBLISH_ENABLED` is set to false/0/no/off. */
export function isEarlyClaimPublishEnabled(): boolean {
  return !/^(false|0|no|off)$/i.test(readEnv('DEBATE_EARLY_CLAIM_PUBLISH_ENABLED'));
}

type AcceptorSpace = { id: string; type: string; address: string };

/** Everything the publish touches outside itself. Injectable for tests. */
export type PublishDebateClaimsDeps = {
  getConfig: () => DebateAcceptorConfig | null;
  debateEntityExists: (debateEntityId: string) => Promise<boolean>;
  loadDebate: (debateId: string) => Promise<Debate>;
  loadEditableSpace: (spaceId: string, config: DebateAcceptorConfig, debateId: string) => Promise<AcceptorSpace | null>;
  loadClaims: (
    debateId: string
  ) => Promise<{ transcriptTurns: DebatePublishTurn[]; claims: DebateClaimInput[] } | null>;
  applyReusePolicy: typeof applyClaimReusePolicy;
  lookupClaims: ExistingClaimLookup;
  prepareOps: (draft: ReturnType<typeof buildDebateClaimsDraft>, spaceId: string) => Promise<Op[]>;
  submit: typeof submitEditAsAcceptor;
};

const defaultDeps: PublishDebateClaimsDeps = {
  getConfig: getDebateAcceptorConfig,
  // A failed read is not "absent": publishing claims early for a debate that is in fact published
  // would only rewrite them (same ids), but it spends an on-chain edit, so a failure throws and the
  // next tick asks again.
  debateEntityExists: async id => (await Effect.runPromise(getEntity(id))) !== null,
  loadDebate: loadSettledDebate,
  loadEditableSpace: loadAcceptorEditableSpace,
  loadClaims: loadDebateClaims,
  applyReusePolicy: applyClaimReusePolicy,
  lookupClaims: lookupExistingClaimsInGraph,
  prepareOps: (draft, spaceId) =>
    Effect.runPromise(Publish.prepareLocalDataForPublishing(draft.values, draft.relations, spaceId)),
  submit: submitEditAsAcceptor,
};

/**
 * Publish the claims of one debate that the graph does not have yet. Throws
 * `DebateNotPublishableError` while the debate is not complete or still inside its opt-out window,
 * and any other error for a failure the next tick should retry.
 */
export async function publishDebateClaimsEarly(
  debateId: string,
  deps: Partial<PublishDebateClaimsDeps> = {}
): Promise<PublishDebateClaimsResult> {
  const d = { ...defaultDeps, ...deps };
  const config = d.getConfig();
  if (!config) return { status: 'acceptor_not_configured' };

  // The full publish writes every claim itself, so once it has run there is nothing to do here.
  if (await d.debateEntityExists(ID.uuidToHex(debateId))) return { status: 'debate_published' };

  // Complete, not cancelled, past the opt-out window — or this throws.
  const debate = await d.loadDebate(debateId);
  const spaceId = debate.claim.space_id;

  const extracted = await d.loadClaims(debateId);
  if (!extracted || extracted.claims.length === 0) return { status: 'no_claims' };

  // The same reuse decision the full publish will make, so a claim it would write as a reference to
  // an existing entity is not minted here. A reference that a later publish drops is minted then,
  // under the same stable id, so the two can disagree only in when the claim appears.
  const claims = await d.applyReusePolicy(extracted.claims, spaceId, {
    debateId,
    motionClaimEntityId: debate.claim.claim_entity_id,
  });
  const draft = buildDebateClaimsDraft({ spaceId, transcriptTurns: extracted.transcriptTurns, claims });
  if (draft.claimIds.length === 0) return { status: 'no_claims' };

  const space = await d.loadEditableSpace(spaceId, config, debateId);
  if (!space) return { status: 'not_editor', spaceId };

  // Which of them the graph already has as Claims in this space. A failed read throws: guessing
  // "none" would re-publish every claim on every tick (harmless to the graph, not to the chain).
  const existing = await d.lookupClaims(draft.claimIds, spaceId);
  const spaceKey = uuidToHex(spaceId);
  const published = new Set(
    existing
      .filter(
        entity =>
          entity.types.some(type => uuidToHex(type.id) === uuidToHex(CLAIM_TYPE_ID)) &&
          entity.spaces.some(space => uuidToHex(space) === spaceKey)
      )
      .map(entity => uuidToHex(entity.id))
  );
  const missing = draft.claimIds.filter(id => !published.has(id));
  if (missing.length === 0) return { status: 'up_to_date', spaceId };

  const pending = buildDebateClaimsDraft({
    spaceId,
    transcriptTurns: extracted.transcriptTurns,
    claims: claims.filter(claim => {
      const id = claim.stableEntityId?.trim();
      return id ? missing.includes(uuidToHex(id)) : false;
    }),
  });
  const ops = await d.prepareOps(pending, spaceId);
  if (ops.length === 0) throw new Error(`Claims of debate ${debateId} resolved to an empty edit.`);

  const userOpHash = await d.submit(config, {
    name: editName(debate, pending.claimIds.length),
    ops,
    space,
  });

  console.log('[debate-acceptor] published debate claims early', {
    debateId,
    spaceId,
    claims: pending.claimIds.length,
    alreadyOnGraph: draft.claimIds.length - missing.length,
    userOpHash,
  });

  return { status: 'published', spaceId, claimIds: pending.claimIds, userOpHash };
}

function editName(debate: Debate, count: number): string {
  const noun = count === 1 ? 'claim' : 'claims';
  return `${count} ${noun} from the debate on "${debate.claim.claim.trim()}"`;
}
