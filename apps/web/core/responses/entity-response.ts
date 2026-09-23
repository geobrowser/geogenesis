import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { uuidToHex } from '~/core/id/normalize';
import type { Entity } from '~/core/types';
import { sleep } from '~/core/utils/utils';

export type ResponseKind = 'curation' | 'stance';
export type ResponseDirection = 'positive' | 'negative' | 'clear';
export type ActiveResponseDirection = Exclude<ResponseDirection, 'clear'>;
export type ResponseVoteKind = 0 | 1;
export type ResponseObjectType = 0 | 1;

export type ResponseActionMethod = 'upvote' | 'downvote' | 'unvote' | 'agree' | 'disagree' | 'unagree';

const RESPONSE_VOTE_KIND: Record<ResponseKind, ResponseVoteKind> = {
  curation: 0,
  stance: 1,
};

const CLAIM_TYPE = uuidToHex(CLAIM_TYPE_ID);
const TYPES_PROPERTY = uuidToHex(SystemIds.TYPES_PROPERTY);

const RESPONSE_ACTION_METHOD: Record<ResponseKind, Record<ResponseDirection, ResponseActionMethod>> = {
  curation: {
    positive: 'upvote',
    negative: 'downvote',
    clear: 'unvote',
  },
  stance: {
    positive: 'agree',
    negative: 'disagree',
    clear: 'unagree',
  },
};

export type EntityResponseCopy = {
  positiveAction: string;
  negativeAction: string;
  removePositive: string;
  removeNegative: string;
  /**
   * The whole invitation, not a verb to interpolate.
   *
   * "Be the first to {positiveAction}" reads correctly for `verify` and `upvote` and not for
   * `agree`, which takes an object through "with". A per-kind sentence costs one line each and
   * cannot be assembled wrongly.
   */
  firstResponsePrompt: string;
  empty: string;
  loading: string;
  viewResponders: string;
  signIn: string;
  connect: string;
};

export const ENTITY_RESPONSE_COPY: Record<ResponseKind, EntityResponseCopy> = {
  curation: {
    positiveAction: 'Upvote',
    negativeAction: 'Downvote',
    removePositive: 'Remove upvote',
    removeNegative: 'Remove downvote',
    firstResponsePrompt: 'Be the first to upvote this claim.',
    empty: 'No votes yet',
    loading: 'Loading voters…',
    viewResponders: 'View voters',
    signIn: 'Sign in to vote',
    connect: 'Connect wallet to vote',
  },
  stance: {
    positiveAction: 'Agree',
    negativeAction: 'Disagree',
    removePositive: 'Remove agreement',
    removeNegative: 'Remove disagreement',
    firstResponsePrompt: 'Be the first to agree with this claim.',
    empty: 'No stances yet',
    loading: 'Loading responders…',
    viewResponders: 'View stances',
    signIn: 'Sign in to respond',
    connect: 'Connect wallet to respond',
  },
};

/**
 * What to call one side of a claim: Agree or Disagree.
 *
 * It used to take the response kind, because a factual claim's sides were called Verify and
 * Dispute. Every claim is answered the same way now, so there is nothing left to choose between
 * and no caller has to work out which vocabulary a claim is in before it can name a side.
 */
/**
 * The copy for a claim's two sides, reached without indexing anything.
 *
 * Claim surfaces must not do `ENTITY_RESPONSE_COPY[kind]` with a kind that came off the wire.
 * geo-chat still labels a claim minted before the vocabularies merged `"veracity"`, and there is no
 * key by that name any more — the lookup returns `undefined` and the surface throws on the first
 * field it reads, which is a blank ticker rather than a wrong word. TypeScript cannot catch it,
 * because the wire value is typed as the narrowed {@link DebateResponseKind} it no longer matches.
 *
 * So the claim surfaces read this instead, and the untrusted value is never a key.
 */
export const CLAIM_RESPONSE_COPY = ENTITY_RESPONSE_COPY.stance;

export function responsePositionLabel(position: boolean) {
  return position ? CLAIM_RESPONSE_COPY.positiveAction : CLAIM_RESPONSE_COPY.negativeAction;
}

/**
 * Curation for an ordinary entity, a stance for a claim.
 *
 * A claim used to take a third vocabulary — Verify/Dispute, published as its own vote kind —
 * whenever it carried the "Is factual" flag. That split is gone: every claim is answered with
 * Agree/Disagree now, whatever the flag says. The flag itself is still written and still read by
 * the debate surfaces that care; it just no longer decides how a claim is answered.
 */
export function getEntityResponseKind({ isClaim }: { isClaim: boolean }): ResponseKind {
  return isClaim ? 'stance' : 'curation';
}

/**
 * No `spaceId`. It used to take one because "Is factual" is a per-space value, so the same claim
 * could be factual in one space and not in another. Being a claim is not per-space in that way —
 * the Types relation is read across every space the entity lives in, which is what lets a claim
 * collected into another space still draw the claim controls.
 */
export function resolveEntityResponseKind(entity: Pick<Entity, 'relations' | 'values'> | null | undefined): ResponseKind {
  const activeRelations = entity?.relations.filter(relation => !relation.isDeleted) ?? [];

  const isClaim = activeRelations.some(
    relation => uuidToHex(relation.type.id) === TYPES_PROPERTY && uuidToHex(relation.toEntity.id) === CLAIM_TYPE
  );

  return getEntityResponseKind({ isClaim });
}

export function hasUnpublishedClaimResponseKindEdit(
  entity: Pick<Entity, 'relations' | 'values'> | null | undefined,
  spaceId: string
) {
  // Optional throughout, past what the types promise.
  //
  // `Entity` declares both arrays and every field read below, and from the sync store they are all
  // there. But this is now on the render path of six claim surfaces rather than one vote button,
  // and they source their entities from several lookups with different projections — a narrow one
  // that omits `values`, a partial built for a list. A missing field here should cost a false
  // negative, which is the pills staying live on a claim that has a draft edit; the alternative is
  // an exception thrown during render, which takes the whole surface down.
  // Only the *type* edit is read now. This used to watch the "Is factual" value too, because that
  // flag chose between two vote kinds and responding across the edit published the wrong one. It
  // no longer chooses anything, so watching it would only block responses on a claim whose draft
  // cannot change how the response is published. Adding or removing the Claim type still flips
  // curation and stance, which is a real kind change and still worth stopping.
  return (
    entity?.relations?.some(
      relation =>
        relation?.type?.id != null &&
        relation.toEntity?.id != null &&
        uuidToHex(relation.spaceId) === uuidToHex(spaceId) &&
        uuidToHex(relation.type.id) === TYPES_PROPERTY &&
        uuidToHex(relation.toEntity.id) === CLAIM_TYPE &&
        relation.isLocal === true &&
        relation.hasBeenPublished !== true
    ) || false
  );
}

export function responseKindToVoteKind(kind: ResponseKind): ResponseVoteKind {
  return RESPONSE_VOTE_KIND[kind];
}

export function getResponseActionMethod(kind: ResponseKind, direction: ResponseDirection): ResponseActionMethod {
  return RESPONSE_ACTION_METHOD[kind][direction];
}

export function decodeActiveResponseDirection(voteType: unknown): ActiveResponseDirection | null {
  if (voteType === 0) return 'positive';
  if (voteType === 1) return 'negative';
  return null;
}

export async function waitForIndexedEntityResponse(
  fetchResponse: (signal: AbortSignal) => Promise<ActiveResponseDirection | null>,
  expectedResponse: ActiveResponseDirection | null,
  maxAttempts = 30,
  intervalMs = 2_000,
  probeTimeoutMs = 5_000,
  signal?: AbortSignal
): Promise<boolean> {
  const deadline = Date.now() + Math.max(probeTimeoutMs, maxAttempts * intervalMs);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) return false;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return false;
    const controller = new AbortController();
    let rejectTimeout: ((reason: Error) => void) | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      rejectTimeout = reject;
    });
    const abortProbe = () => {
      controller.abort();
      rejectTimeout?.(new Error('Response indexing reconciliation was superseded'));
    };
    signal?.addEventListener('abort', abortProbe, { once: true });
    const timeoutId = setTimeout(
      () => {
        controller.abort();
        rejectTimeout?.(new Error('Timed out waiting for Gaia response indexing'));
      },
      Math.min(probeTimeoutMs, remainingMs)
    );

    try {
      if ((await Promise.race([fetchResponse(controller.signal), timeoutPromise])) === expectedResponse) {
        return true;
      }
    } catch {
      // Gaia can fail transiently while indexing. Keep the transaction in its
      // processing state and retry instead of presenting a false write error.
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortProbe);
    }

    if (attempt < maxAttempts) {
      if (signal?.aborted) return false;
      await sleep(intervalMs);
    }
  }

  return false;
}

export function entityResponseQueryVariables(
  entityId: string,
  spaceId: string,
  objectType: ResponseObjectType,
  responseKind: ResponseKind
) {
  return {
    objectId: entityId,
    objectType,
    spaceId,
    voteKind: responseKindToVoteKind(responseKind),
  } as const;
}

export function entityResponseCountsQueryKey(
  entityId: string,
  spaceId: string,
  objectType: ResponseObjectType,
  responseKind: ResponseKind
) {
  return ['entity-response-counts', entityId, spaceId, objectType, responseKind] as const;
}

export function userEntityResponseQueryKey(
  userId: string | null | undefined,
  entityId: string,
  spaceId: string,
  objectType: ResponseObjectType,
  responseKind: ResponseKind
) {
  return ['user-entity-response', userId, entityId, spaceId, objectType, responseKind] as const;
}

export function entityResponseIndexingQueryKey(
  personalSpaceId: string | null,
  entityId: string,
  spaceId: string,
  responseKind: ResponseKind | null
) {
  return ['entity-response-indexing', personalSpaceId, entityId, spaceId, responseKind] as const;
}

export function entityRespondersQueryKey(
  entityId: string,
  spaceId: string,
  objectType: ResponseObjectType,
  responseKind: ResponseKind
) {
  return ['entity-responders', entityId, spaceId, objectType, responseKind] as const;
}

export function entityResponderProfilesQueryKey(
  entityId: string,
  spaceId: string,
  objectType: ResponseObjectType,
  responseKind: ResponseKind
) {
  return ['entity-responder-profiles', entityId, spaceId, objectType, responseKind] as const;
}
