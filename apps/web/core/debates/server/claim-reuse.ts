import { Effect } from 'effect';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

import type { DebateClaimInput } from '../debate-publish-draft';
import { readEnv } from './acceptor-config';
import { existingClaimsDocument } from './existing-claims-document';

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
 * On by default. `DEBATE_CLAIM_REUSE_ENABLED=false` turns it off: every reference is then dropped and
 * only counted, so a deployment can run geo-chat's matching in shadow mode and read its verdicts
 * from `GET /debates/{id}/claims` without reusing a single entity.
 */

/** What the verifier needs to know about a referenced entity. */
export type ExistingClaimEntity = {
  id: string;
  /** Every space holding a value or relation of the entity. */
  spaces: string[];
  types: Array<{ id: string }>;
};

export type ExistingClaimLookup = (entityIds: string[]) => Promise<ExistingClaimEntity[]>;

const lookupInGraph: ExistingClaimLookup = entityIds =>
  Effect.runPromise(
    graphql({
      query: existingClaimsDocument,
      decoder: data =>
        (data.entities ?? []).flatMap(entity =>
          entity
            ? [
                {
                  id: entity.id,
                  spaces: (entity.spaceIds ?? []).filter((id): id is string => typeof id === 'string'),
                  types: (entity.types ?? []).flatMap(type => (type ? [{ id: type.id }] : [])),
                },
              ]
            : []
        ),
      variables: { ids: entityIds },
    })
  );

/** A Geo entity id in either shape: 32 hex chars, dashed or not. Anything else cannot be queried. */
export function looksLikeEntityId(id: string): boolean {
  return /^[0-9a-f]{32}$/i.test(id.replace(/-/g, ''));
}

export function isDebateClaimReuseEnabled(): boolean {
  return !/^(false|0|no|off)$/i.test(readEnv('DEBATE_CLAIM_REUSE_ENABLED'));
}

export type ClaimReuseOptions = {
  /** Defaults to `DEBATE_CLAIM_REUSE_ENABLED`. */
  enabled?: boolean;
  /** Defaults to a batched graph read. Injectable for tests. */
  lookup?: ExistingClaimLookup;
  /**
   * The debate's own motion. It is a Claim in the publication space, so it passes every other check,
   * but a debater restating the motion must not make the motion "their" transcript claim.
   */
  motionClaimEntityId?: string;
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

  // One malformed id would fail the whole batched read (the API rejects the query, not the id), and
  // the fail-safe below would then mint every matched claim in the debate. Drop those first.
  const isMalformed = (id: string) => !looksLikeEntityId(id);
  const malformed = referenced.filter(claim => isMalformed(claim.existingClaimEntityId as string));
  if (malformed.length > 0) {
    console.warn('[debate-acceptor] matched claims carry ids that are not entity ids; minting them instead', {
      debateId: options.debateId,
      ids: malformed.map(claim => claim.existingClaimEntityId),
    });
  }

  const motionKey = options.motionClaimEntityId ? uuidToHex(options.motionClaimEntityId) : null;
  const isMotion = (id: string) => motionKey !== null && uuidToHex(id) === motionKey;
  const motionReferences = referenced.filter(claim => isMotion(claim.existingClaimEntityId as string));
  if (motionReferences.length > 0) {
    console.warn('[debate-acceptor] matched claims point at the debate motion; minting them instead', {
      debateId: options.debateId,
      count: motionReferences.length,
    });
  }

  const ids = [
    ...new Set(
      referenced.map(claim => claim.existingClaimEntityId as string).filter(id => !isMalformed(id) && !isMotion(id))
    ),
  ];
  let verified: Set<string>;
  try {
    const entities = ids.length > 0 ? await (options.lookup ?? lookupInGraph)(ids) : [];
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
    if (
      !isMalformed(claim.existingClaimEntityId) &&
      !isMotion(claim.existingClaimEntityId) &&
      verified.has(uuidToHex(claim.existingClaimEntityId))
    ) {
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
        .filter(claim => {
          const id = claim.existingClaimEntityId as string;
          return isMalformed(id) || isMotion(id) || !verified.has(uuidToHex(id));
        })
        .map(claim => claim.existingClaimEntityId),
    });
  }
  return result;
}

function withoutReference(claim: DebateClaimInput): DebateClaimInput {
  return claim.existingClaimEntityId ? { ...claim, existingClaimEntityId: null } : claim;
}
