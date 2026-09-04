import { Effect } from 'effect';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { uuidToHex } from '~/core/id/normalize';
import { getBatchEntities } from '~/core/io/queries';

import type { DebateClaimInput } from '../debate-publish-draft';

/**
 * Find-or-create, half two: which of geo-chat's `existing_entity_id` references the publisher may
 * honour.
 *
 * geo-chat's media worker matched each extracted claim against the published claims in the debate's
 * space (geo-lens retrieval, then extraction-api's equivalence judge) about an hour before this
 * sweep runs. Two things can still be wrong with a reference by now, so each is checked in one
 * batched graph read before the draft is built: the entity may have been deleted or re-typed, or it
 * may live in another space after all. Anything that fails is minted as a fresh Claim, exactly as
 * before matching existed — a duplicate is the known, tolerable failure; attaching a debater to the
 * wrong entity is not.
 *
 * Behind `DEBATE_CLAIM_REUSE_ENABLED`. With it off (the default) every reference is dropped and only
 * counted, so a deployment can run geo-chat's matching in shadow mode and read its verdicts from
 * `GET /debates/{id}/claims` before a single entity is reused.
 */

/** What the verifier needs to know about a referenced entity. */
export type ExistingClaimEntity = {
  id: string;
  /** Every space holding a value or relation of the entity. */
  spaces: string[];
  types: Array<{ id: string }>;
};

export type ExistingClaimLookup = (entityIds: string[]) => Promise<ExistingClaimEntity[]>;

const lookupInGraph: ExistingClaimLookup = async entityIds => {
  const entities = await Effect.runPromise(getBatchEntities(entityIds));
  return entities.map(entity => ({ id: entity.id, spaces: entity.spaces, types: entity.types }));
};

/** Secrets UIs and shell exports often keep the wrapping quotes as part of the value. */
function readEnv(name: string): string {
  const value = process.env[name]?.trim() ?? '';
  const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
  return quoted ? quoted[2].trim() : value;
}

export function isDebateClaimReuseEnabled(): boolean {
  return /^(true|1|yes|on)$/i.test(readEnv('DEBATE_CLAIM_REUSE_ENABLED'));
}

export type ClaimReuseOptions = {
  /** Defaults to `DEBATE_CLAIM_REUSE_ENABLED`. */
  enabled?: boolean;
  /** Defaults to a batched graph read. Injectable for tests. */
  lookup?: ExistingClaimLookup;
  /** For the log line only. */
  debateId?: string;
};

/**
 * Returns the claims with `existingClaimEntityId` kept only where reuse is enabled AND the entity
 * exists, carries the Claim type and lives in `spaceId`. Every other reference becomes null. Never
 * throws: a failed graph read drops every reference (and says so), because minting duplicates is the
 * pre-matching behaviour and the safe side.
 */
export async function applyClaimReusePolicy(
  claims: DebateClaimInput[],
  spaceId: string,
  options: ClaimReuseOptions = {}
): Promise<DebateClaimInput[]> {
  const referenced = claims.filter(claim => Boolean(claim.existingClaimEntityId));
  if (referenced.length === 0) return claims;

  const enabled = options.enabled ?? isDebateClaimReuseEnabled();
  if (!enabled) {
    console.log('[debate-acceptor] claim reuse is off; minting matched claims (shadow mode)', {
      debateId: options.debateId,
      claims: claims.length,
      matched: referenced.length,
    });
    return claims.map(withoutReference);
  }

  const ids = [...new Set(referenced.map(claim => claim.existingClaimEntityId as string))];
  let verified: Set<string>;
  try {
    const entities = await (options.lookup ?? lookupInGraph)(ids);
    const spaceKey = uuidToHex(spaceId);
    verified = new Set(
      entities
        .filter(
          entity =>
            entity.types.some(type => uuidToHex(type.id) === uuidToHex(CLAIM_TYPE_ID)) &&
            entity.spaces.some(space => uuidToHex(space) === spaceKey)
        )
        .map(entity => uuidToHex(entity.id))
    );
  } catch (error) {
    console.warn('[debate-acceptor] could not verify matched claims; minting all of them instead', {
      debateId: options.debateId,
      matched: referenced.length,
      error,
    });
    return claims.map(withoutReference);
  }

  let reused = 0;
  const result = claims.map(claim => {
    if (!claim.existingClaimEntityId) return claim;
    if (verified.has(uuidToHex(claim.existingClaimEntityId))) {
      reused += 1;
      return claim;
    }
    return withoutReference(claim);
  });
  const dropped = referenced.length - reused;
  console.log('[debate-acceptor] claim reuse decided', {
    debateId: options.debateId,
    claims: claims.length,
    matched: referenced.length,
    reused,
    dropped,
  });
  if (dropped > 0) {
    console.warn('[debate-acceptor] matched claims no longer verifiable as Claims in this space; minted instead', {
      debateId: options.debateId,
      spaceId,
      entityIds: referenced
        .filter(claim => !verified.has(uuidToHex(claim.existingClaimEntityId as string)))
        .map(claim => claim.existingClaimEntityId),
    });
  }
  return result;
}

function withoutReference(claim: DebateClaimInput): DebateClaimInput {
  return claim.existingClaimEntityId ? { ...claim, existingClaimEntityId: null } : claim;
}
