import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { uuidToHex } from '~/core/id/normalize';
import type { Entity } from '~/core/types';
import { sleep } from '~/core/utils/utils';

export type ResponseKind = 'curation' | 'stance' | 'veracity';
export type ResponseDirection = 'positive' | 'negative' | 'clear';
export type ActiveResponseDirection = Exclude<ResponseDirection, 'clear'>;
export type ResponseVoteKind = 0 | 1 | 2;
export type ResponseObjectType = 0 | 1;

export type ResponseActionMethod =
  'upvote' | 'downvote' | 'unvote' | 'agree' | 'disagree' | 'unagree' | 'verify' | 'dispute' | 'unverify';

const RESPONSE_VOTE_KIND: Record<ResponseKind, ResponseVoteKind> = {
  curation: 0,
  stance: 1,
  veracity: 2,
};

const CLAIM_TYPE = uuidToHex(CLAIM_TYPE_ID);
const CLAIM_IS_FACTUAL = uuidToHex(CLAIM_IS_FACTUAL_PROPERTY_ID);
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
  veracity: {
    positive: 'verify',
    negative: 'dispute',
    clear: 'unverify',
  },
};

export type EntityResponseCopy = {
  positiveAction: string;
  negativeAction: string;
  removePositive: string;
  removeNegative: string;
  positiveSection: string;
  negativeSection: string;
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
    positiveSection: 'Upvotes',
    negativeSection: 'Downvotes',
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
    positiveSection: 'Agreements',
    negativeSection: 'Disagreements',
    empty: 'No stances yet',
    loading: 'Loading responders…',
    viewResponders: 'View stances',
    signIn: 'Sign in to respond',
    connect: 'Connect wallet to respond',
  },
  veracity: {
    positiveAction: 'Verify',
    negativeAction: 'Dispute',
    removePositive: 'Remove verification',
    removeNegative: 'Remove dispute',
    positiveSection: 'Verifications',
    negativeSection: 'Disputes',
    empty: 'No veracity responses yet',
    loading: 'Loading responders…',
    viewResponders: 'View veracity responses',
    signIn: 'Sign in to respond',
    connect: 'Connect wallet to respond',
  },
};

export function getEntityResponseKind({ isClaim, isFactual }: { isClaim: boolean; isFactual: boolean }): ResponseKind {
  if (!isClaim) return 'curation';
  return isFactual ? 'veracity' : 'stance';
}

export function hasUnpublishedClaimResponseKindEdit(
  entity: Pick<Entity, 'relations' | 'values'> | null | undefined,
  spaceId: string
) {
  return (
    entity?.values.some(
      value =>
        uuidToHex(value.spaceId) === uuidToHex(spaceId) &&
        uuidToHex(value.property.id) === CLAIM_IS_FACTUAL &&
        value.isLocal === true &&
        value.hasBeenPublished !== true
    ) ||
    entity?.relations.some(
      relation =>
        uuidToHex(relation.spaceId) === uuidToHex(spaceId) &&
        uuidToHex(relation.type.id) === TYPES_PROPERTY &&
        uuidToHex(relation.toEntity.id) === CLAIM_TYPE &&
        relation.isLocal === true &&
        relation.hasBeenPublished !== true
    ) ||
    false
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

export function entityResponseIndexingQueryKey(entityId: string, spaceId: string, responseKind: ResponseKind | null) {
  return ['entity-response-indexing', entityId, spaceId, responseKind] as const;
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
