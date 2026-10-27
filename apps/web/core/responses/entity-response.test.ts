import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it, vi } from 'vitest';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID } from '~/core/claims/ontology';

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
  resolveEntityResponseKind,
  responseKindToVoteKind,
  responsePositionLabel,
  userEntityResponseQueryKey,
  waitForIndexedEntityResponse,
} from './entity-response';

const SPACE_ID = '1234567890abcdef1234567890abcdef';
const OTHER_SPACE_ID = 'abcdef1234567890abcdef1234567890';

// `resolveEntityResponseKind` reads only `isDeleted`, `type.id`, `toEntity.id`, `spaceId`,
// `property.id` and `value`, so the fixtures below carry only those. That is less than a full
// `Value`/`Relation`, which is why the assertions go through `unknown`.
type ResolveEntity = NonNullable<Parameters<typeof resolveEntityResponseKind>[0]>;

function plainEntity(): ResolveEntity {
  return { relations: [], values: [] };
}

function claimEntity(factualValue?: string): ResolveEntity {
  return {
    relations: [
      {
        type: { id: SystemIds.TYPES_PROPERTY },
        toEntity: { id: CLAIM_TYPE_ID },
        isDeleted: false,
      },
    ],
    values:
      factualValue === undefined
        ? []
        : [
            {
              spaceId: SPACE_ID,
              property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID },
              value: factualValue,
              isDeleted: false,
            },
          ],
  } as unknown as ResolveEntity;
}

describe('entity response semantics', () => {
  it.each([
    [{ isClaim: false }, 'curation'],
    [{ isClaim: true }, 'stance'],
  ] as const)('selects the active response kind for %o', (input, expected) => {
    expect(getEntityResponseKind(input)).toBe(expected);
  });

  it('resolves plain entities to curation', () => {
    expect(resolveEntityResponseKind(plainEntity())).toBe('curation');
    expect(resolveEntityResponseKind(null)).toBe('curation');
  });

  /**
   * The point of the change, stated directly: a claim flagged factual is answered exactly like one
   * that is not. `'1'` is the checked value that used to select Verify/Dispute and its own vote
   * kind, and it is the case this has to keep pinned — the others are here so a regression that
   * reintroduced the branch on any spelling of the flag still fails.
   */
  it.each([['1'], ['0'], [undefined], ['true'], ['yes'], ['malformed']] as const)(
    'answers a claim with a stance whatever its factual value (%s) says',
    factualValue => {
      expect(resolveEntityResponseKind(claimEntity(factualValue))).toBe('stance');
    }
  );

  it('publishes a factual claim against the same vote kind as any other claim', () => {
    const factual = responseKindToVoteKind(resolveEntityResponseKind(claimEntity('1')));
    const ordinary = responseKindToVoteKind(resolveEntityResponseKind(claimEntity('0')));

    // Not merely equal — equal to the *stance* kind. Both resolving to the retired veracity kind
    // would satisfy an equality check and would be the bug.
    expect(factual).toBe(ordinary);
    expect(factual).toBe(responseKindToVoteKind('stance'));
  });

  it('names both sides of a factual claim Agree and Disagree', () => {
    const copy = ENTITY_RESPONSE_COPY[resolveEntityResponseKind(claimEntity('1'))];

    expect(copy.positiveAction).toBe('Agree');
    expect(copy.negativeAction).toBe('Disagree');
    expect(responsePositionLabel(true)).toBe('Agree');
    expect(responsePositionLabel(false)).toBe('Disagree');
  });

  it('ignores factual values from other spaces when resolving kind', () => {
    const entity = {
      relations: [
        {
          type: { id: SystemIds.TYPES_PROPERTY },
          toEntity: { id: CLAIM_TYPE_ID },
          isDeleted: false,
        },
      ],
      values: [
        {
          spaceId: OTHER_SPACE_ID,
          property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID },
          value: '1',
          isDeleted: false,
        },
      ],
    } as unknown as ResolveEntity;

    expect(resolveEntityResponseKind(entity)).toBe('stance');
  });

  it.each([
    ['curation', 0],
    ['stance', 1],
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
  ] as const)('routes %s/%s to geo.responses.%s', (kind, direction, expected) => {
    expect(getResponseActionMethod(kind, direction)).toBe(expected);
  });

  it.each([
    ['curation', 'Upvote', 'Downvote', 'No votes yet'],
    ['stance', 'Agree', 'Disagree', 'No stances yet'],
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

  /**
   * The guard used to stop here, because the flag chose between two vote kinds and responding
   * across the edit published the wrong one. The flag chooses nothing now, so blocking on it would
   * only disable the pills on a claim whose draft cannot change how a response is published.
   */
  it('lets someone respond while a factual edit is still unpublished', () => {
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

    expect(hasUnpublishedClaimResponseKindEdit(entity, SPACE_ID)).toBe(false);
  });

  /**
   * And the half that still matters. Adding the Claim type moves an entity between curation and
   * stance, which really are different vote kinds — so this one still has to stop a response.
   */
  it('still blocks responses while an unpublished Claim type edit could change the vote kind', () => {
    const entity = {
      values: [],
      relations: [
        {
          spaceId: SPACE_ID,
          type: { id: SystemIds.TYPES_PROPERTY },
          toEntity: { id: CLAIM_TYPE_ID },
          isLocal: true,
          hasBeenPublished: false,
        },
      ],
    } as unknown as NonNullable<Parameters<typeof hasUnpublishedClaimResponseKindEdit>[0]>;

    expect(hasUnpublishedClaimResponseKindEdit(entity, SPACE_ID)).toBe(true);
    expect(hasUnpublishedClaimResponseKindEdit(entity, OTHER_SPACE_ID)).toBe(false);

    entity.relations[0]!.hasBeenPublished = true;
    expect(hasUnpublishedClaimResponseKindEdit(entity, SPACE_ID)).toBe(false);
  });

  it('blocks responses for unpublished response-kind tombstones', () => {
    const entity = {
      values: [],
      relations: [
        {
          spaceId: SPACE_ID,
          type: { id: SystemIds.TYPES_PROPERTY },
          toEntity: { id: CLAIM_TYPE_ID },
          isDeleted: true,
          isLocal: true,
          hasBeenPublished: false,
        },
      ],
    } as unknown as NonNullable<Parameters<typeof hasUnpublishedClaimResponseKindEdit>[0]>;

    expect(hasUnpublishedClaimResponseKindEdit(entity, SPACE_ID)).toBe(true);
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
    expect(userEntityResponseQueryKey('user', 'entity', 'space', 0, 'stance')).toEqual([
      'user-entity-response',
      'user',
      'entity',
      'space',
      0,
      'stance',
    ]);
    expect(entityRespondersQueryKey('entity', 'space', 0, 'curation')).toEqual([
      'entity-responders',
      'entity',
      'space',
      0,
      'curation',
    ]);
    expect(entityResponseIndexingQueryKey('profile-space', 'entity', 'space', 'stance')).toEqual([
      'entity-response-indexing',
      'profile-space',
      'entity',
      'space',
      'stance',
    ]);
  });
});
