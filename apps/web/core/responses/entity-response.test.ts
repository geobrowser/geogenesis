import { describe, expect, it, vi } from 'vitest';

import { CLAIM_IS_FACTUAL_PROPERTY_ID } from '~/core/claims/ontology';

import { getChecked } from '~/design-system/checkbox';

import {
  ENTITY_RESPONSE_COPY,
  decodeActiveResponseDirection,
  entityRespondersQueryKey,
  entityResponseCountsQueryKey,
  entityResponseIndexingQueryKey,
  entityResponseQueryVariables,
  getEntityResponseKind,
  getResponseActionMethod,
  hasUnpublishedClaimResponseKindEdit,
  responseKindToVoteKind,
  userEntityResponseQueryKey,
  waitForIndexedEntityResponse,
} from './entity-response';

const SPACE_ID = '1234567890abcdef1234567890abcdef';
const OTHER_SPACE_ID = 'abcdef1234567890abcdef1234567890';

describe('entity response semantics', () => {
  it.each([
    [{ isClaim: false, isFactual: false }, 'curation'],
    [{ isClaim: false, isFactual: true }, 'curation'],
    [{ isClaim: true, isFactual: false }, 'stance'],
    [{ isClaim: true, isFactual: true }, 'veracity'],
  ] as const)('selects the active response kind for %o', (input, expected) => {
    expect(getEntityResponseKind(input)).toBe(expected);
  });

  it.each([
    ['1', 'veracity'],
    ['0', 'stance'],
    [undefined, 'stance'],
    ['true', 'stance'],
    ['yes', 'stance'],
    ['malformed', 'stance'],
  ] as const)('uses canonical checked semantics for factual value %s', (factualValue, expected) => {
    expect(getEntityResponseKind({ isClaim: true, isFactual: getChecked(factualValue) === true })).toBe(expected);
  });

  it.each([
    ['curation', 0],
    ['stance', 1],
    ['veracity', 2],
  ] as const)('maps %s to backend voteKind %i', (kind, expected) => {
    expect(responseKindToVoteKind(kind)).toBe(expected);
  });

  it.each([
    ['curation', 'positive', 'upvote'],
    ['curation', 'negative', 'downvote'],
    ['curation', 'clear', 'unvote'],
    ['stance', 'positive', 'agree'],
    ['stance', 'negative', 'disagree'],
    ['stance', 'clear', 'unagree'],
    ['veracity', 'positive', 'verify'],
    ['veracity', 'negative', 'dispute'],
    ['veracity', 'clear', 'unverify'],
  ] as const)('routes %s/%s to geo.responses.%s', (kind, direction, expected) => {
    expect(getResponseActionMethod(kind, direction)).toBe(expected);
  });

  it.each([
    ['curation', 'Upvote', 'Downvote', 'No votes yet'],
    ['stance', 'Agree', 'Disagree', 'No stances yet'],
    ['veracity', 'Verify', 'Dispute', 'No veracity responses yet'],
  ] as const)('uses semantic %s response copy', (kind, positive, negative, empty) => {
    expect(ENTITY_RESPONSE_COPY[kind]).toMatchObject({
      positiveAction: positive,
      negativeAction: negative,
      empty,
    });
  });

  it.each([
    [0, 'positive'],
    [1, 'negative'],
    [2, null],
    [null, null],
    [undefined, null],
    [9, null],
  ] as const)('normalizes backend voteType %s to %s', (voteType, expected) => {
    expect(decodeActiveResponseDirection(voteType)).toBe(expected);
  });

  it('blocks responses while an exact-space factual edit is still unpublished', () => {
    const entity = {
      relations: [],
      values: [
        {
          spaceId: SPACE_ID,
          property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID },
          isLocal: true,
          hasBeenPublished: false,
        },
      ],
    } as unknown as NonNullable<Parameters<typeof hasUnpublishedClaimResponseKindEdit>[0]>;

    expect(hasUnpublishedClaimResponseKindEdit(entity, SPACE_ID)).toBe(true);
    expect(hasUnpublishedClaimResponseKindEdit(entity, OTHER_SPACE_ID)).toBe(false);

    entity.values[0]!.hasBeenPublished = true;
    expect(hasUnpublishedClaimResponseKindEdit(entity, SPACE_ID)).toBe(false);
  });

  it('keeps polling until Gaia serves the expected response', async () => {
    const indexedResponses = [null, null, 'positive'] as const;
    let attempt = 0;

    await expect(
      waitForIndexedEntityResponse(
        async () => indexedResponses[Math.min(attempt++, indexedResponses.length - 1)] ?? null,
        'positive',
        3,
        0
      )
    ).resolves.toBe(true);
    expect(attempt).toBe(3);
  });

  it('treats a cleared Gaia response as indexed and tolerates transient failures', async () => {
    let attempt = 0;

    await expect(
      waitForIndexedEntityResponse(
        async () => {
          attempt += 1;
          if (attempt === 1) throw new Error('temporarily unavailable');
          return null;
        },
        null,
        2,
        0
      )
    ).resolves.toBe(true);
    expect(attempt).toBe(2);
  });

  it('aborts and retries a Gaia probe that never settles', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const polling = waitForIndexedEntityResponse(
      signal =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        }),
      'positive',
      1,
      0,
      50
    );

    await vi.advanceTimersByTimeAsync(50);

    await expect(polling).resolves.toBe(false);
    expect(aborted).toBe(true);
    vi.useRealTimers();
  });

  it('stops polling when a reconciliation run is superseded', async () => {
    const controller = new AbortController();
    let attempts = 0;
    const polling = waitForIndexedEntityResponse(
      signal => {
        attempts += 1;
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      },
      'positive',
      30,
      2_000,
      5_000,
      controller.signal
    );
    await Promise.resolve();

    controller.abort();

    await expect(polling).resolves.toBe(false);
    expect(attempts).toBe(1);
  });
});

describe('entity response query keys', () => {
  it('builds exact-space and exact-kind query variables', () => {
    expect(entityResponseQueryVariables('entity', 'space', 0, 'stance')).toEqual({
      objectId: 'entity',
      objectType: 0,
      spaceId: 'space',
      voteKind: 1,
    });
  });

  it('includes exact space and response kind in cache keys', () => {
    expect(entityResponseCountsQueryKey('entity', 'space', 0, 'stance')).toEqual([
      'entity-response-counts',
      'entity',
      'space',
      0,
      'stance',
    ]);
    expect(userEntityResponseQueryKey('user', 'entity', 'space', 0, 'veracity')).toEqual([
      'user-entity-response',
      'user',
      'entity',
      'space',
      0,
      'veracity',
    ]);
    expect(entityRespondersQueryKey('entity', 'space', 0, 'curation')).toEqual([
      'entity-responders',
      'entity',
      'space',
      0,
      'curation',
    ]);
    expect(entityResponseIndexingQueryKey('entity', 'space', 'stance')).toEqual([
      'entity-response-indexing',
      'entity',
      'space',
      'stance',
    ]);
  });
});
