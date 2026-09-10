import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import type { DebateClaimInput } from '../debate-publish-draft';
import {
  type ExistingClaimEntity,
  type ExistingClaimLookup,
  applyClaimReusePolicy,
  isDebateClaimReuseEnabled,
} from './claim-reuse';

const SPACE = 'c9f267dcb0d270718c2a3c45a64afd32';
const OTHER_SPACE = '4582fbbee28a16589154f7e36f1ee3c5';
const EXISTING = '4f12f5ea073442cbaa0fb10f70a9a876';
const GONE = '00000000000000000000000000000001';
const ELSEWHERE = '00000000000000000000000000000002';
const NOT_A_CLAIM = '00000000000000000000000000000003';

const claims: DebateClaimInput[] = [
  {
    text: 'The burden to obtain an ID for voting may be too high.',
    isFactual: false,
    turnIndex: 0,
    existingClaimEntityId: EXISTING,
  },
  { text: 'A novel point.', isFactual: true, turnIndex: 1, existingClaimEntityId: null },
  { text: 'Deleted since the match.', isFactual: null, turnIndex: 1, existingClaimEntityId: GONE },
  { text: 'Lives in another space.', isFactual: null, turnIndex: 2, existingClaimEntityId: ELSEWHERE },
  { text: 'Re-typed since the match.', isFactual: null, turnIndex: 2, existingClaimEntityId: NOT_A_CLAIM },
];

const graph: ExistingClaimEntity[] = [
  { id: EXISTING, spaces: [SPACE, OTHER_SPACE], types: [{ id: CLAIM_TYPE_ID }] },
  { id: ELSEWHERE, spaces: [OTHER_SPACE], types: [{ id: CLAIM_TYPE_ID }] },
  { id: NOT_A_CLAIM, spaces: [SPACE], types: [{ id: 'dec3c8cae071482394f1dc4de11e7fb6' }] },
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('applyClaimReusePolicy', () => {
  it('reads topics scoped to the publication space', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const lookup = vi.fn<ExistingClaimLookup>(async () => graph);

    await applyClaimReusePolicy(claims, SPACE, { enabled: true, lookup });

    // Relations are per-space: a topic the entity carries in another space is not a duplicate
    // here, so the read has to be scoped or the writer would skip a relation this space needs.
    expect(lookup.mock.calls[0]?.[1]).toBe(SPACE);
  });

  it('does not re-tag a reused entity that already carries the Debate tag', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const DEBATE_TAG = '55c95b2626f8482cb9739ea99dfde438';
    const lookup = vi.fn<ExistingClaimLookup>(async () => [
      { id: EXISTING, spaces: [SPACE], types: [{ id: CLAIM_TYPE_ID }], tagIds: [DEBATE_TAG] },
    ]);

    const result = await applyClaimReusePolicy(
      [{ text: 'Matched.', isFactual: null, turnIndex: 0, existingClaimEntityId: EXISTING, isContestable: true }],
      SPACE,
      { enabled: true, lookup }
    );

    expect(result[0].existingClaimEntityId).toBe(EXISTING);
    expect(result[0].isContestable).toBe(false);
  });

  it('tags a reused entity that is not yet a debate claim', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const lookup = vi.fn<ExistingClaimLookup>(async () => [
      { id: EXISTING, spaces: [SPACE], types: [{ id: CLAIM_TYPE_ID }], tagIds: [] },
    ]);

    const result = await applyClaimReusePolicy(
      [{ text: 'Matched.', isFactual: null, turnIndex: 0, existingClaimEntityId: EXISTING, isContestable: true }],
      SPACE,
      { enabled: true, lookup }
    );

    expect(result[0].isContestable).toBe(true);
  });

  it('subtracts topics the reused entity already carries and keeps the rest', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const CARRIED = { id: '27b73193ecea48fdaa46fdee40c0b717', name: 'AI and mental health' };
    const MISSING = { id: '3f2044d6609746cd964da85414f7ba63', name: 'Morning routine' };
    const lookup = vi.fn<ExistingClaimLookup>(async () => [
      { id: EXISTING, spaces: [SPACE], types: [{ id: CLAIM_TYPE_ID }], topicIds: [CARRIED.id] },
    ]);

    const result = await applyClaimReusePolicy(
      [
        {
          text: 'Matched.',
          isFactual: null,
          turnIndex: 0,
          existingClaimEntityId: EXISTING,
          topics: [CARRIED, MISSING],
        },
      ],
      SPACE,
      { enabled: true, lookup }
    );

    expect(result[0].existingClaimEntityId).toBe(EXISTING);
    expect(result[0].topics).toEqual([MISSING]);
  });

  it('keeps every topic on a claim whose reference is dropped (it mints a fresh entity)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const TOPIC = { id: '27b73193ecea48fdaa46fdee40c0b717', name: 'AI and mental health' };
    const lookup = vi.fn<ExistingClaimLookup>(async () => []);

    const result = await applyClaimReusePolicy(
      [{ text: 'Gone.', isFactual: null, turnIndex: 0, existingClaimEntityId: GONE, topics: [TOPIC] }],
      SPACE,
      { enabled: true, lookup }
    );

    expect(result[0].existingClaimEntityId).toBeNull();
    expect(result[0].topics).toEqual([TOPIC]);
  });

  it('drops every reference and never reads the graph while reuse is off (shadow mode)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const lookup = vi.fn(async () => graph);

    const result = await applyClaimReusePolicy(claims, SPACE, { enabled: false, lookup });

    expect(lookup).not.toHaveBeenCalled();
    expect(result.map(claim => claim.existingClaimEntityId)).toEqual([null, null, null, null, null]);
    // Nothing else about the claims changes.
    expect(result.map(claim => claim.text)).toEqual(claims.map(claim => claim.text));
  });

  it('keeps a reference only when the entity still exists as a Claim in this space', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lookup = vi.fn<ExistingClaimLookup>(async () => graph);

    const result = await applyClaimReusePolicy(claims, SPACE, { enabled: true, lookup });

    // One batched read over the distinct referenced ids.
    expect(lookup).toHaveBeenCalledTimes(1);
    expect([...(lookup.mock.calls[0]?.[0] ?? [])].sort()).toEqual([EXISTING, GONE, ELSEWHERE, NOT_A_CLAIM].sort());
    expect(result.map(claim => claim.existingClaimEntityId)).toEqual([EXISTING, null, null, null, null]);
  });

  it('never reuses the debate motion, even though it is a Claim in the space', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const motion = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const lookup = vi.fn<ExistingClaimLookup>(async () => [
      ...graph,
      { id: motion, spaces: [SPACE], types: [{ id: CLAIM_TYPE_ID }] },
    ]);
    const restated: DebateClaimInput = {
      text: 'The motion, restated.',
      isFactual: null,
      turnIndex: 0,
      existingClaimEntityId: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
    };

    const result = await applyClaimReusePolicy([restated, claims[0]], SPACE, {
      enabled: true,
      lookup,
      motionClaimEntityId: motion,
    });

    expect(result.map(claim => claim.existingClaimEntityId)).toEqual([null, EXISTING]);
    // The motion is not even looked up.
    expect(lookup.mock.calls[0]?.[0]).toEqual([EXISTING]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('debate motion'), expect.objectContaining({ count: 1 }));
  });

  it('drops references that are not entity ids without failing the batch for the rest', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lookup = vi.fn<ExistingClaimLookup>(async () => graph);
    const broken: DebateClaimInput = {
      text: 'Bad reference.',
      isFactual: null,
      turnIndex: 0,
      existingClaimEntityId: 'not-an-id',
    };

    const result = await applyClaimReusePolicy([broken, claims[0]], SPACE, { enabled: true, lookup });

    expect(result.map(claim => claim.existingClaimEntityId)).toEqual([null, EXISTING]);
    expect(lookup.mock.calls[0]?.[0]).toEqual([EXISTING]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('not entity ids'),
      expect.objectContaining({ ids: ['not-an-id'] })
    );
  });

  it('accepts a space id in dashed form against the graph’s hex spaceIds', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const lookup = vi.fn(async () => graph);
    const dashed = 'c9f267dc-b0d2-7071-8c2a-3c45a64afd32';

    const result = await applyClaimReusePolicy([claims[0]], dashed, { enabled: true, lookup });

    expect(result[0].existingClaimEntityId).toBe(EXISTING);
  });

  it('mints everything when the verification read fails, rather than trusting stale references', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lookup = vi.fn(async () => {
      throw new Error('graph unavailable');
    });

    const result = await applyClaimReusePolicy(claims, SPACE, { enabled: true, lookup });

    expect(result.every(claim => claim.existingClaimEntityId === null)).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('returns the input untouched when nothing was matched', async () => {
    const lookup = vi.fn(async () => graph);
    const unmatched = claims.map(claim => ({ ...claim, existingClaimEntityId: null }));

    const result = await applyClaimReusePolicy(unmatched, SPACE, { enabled: true, lookup });

    expect(result).toBe(unmatched);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('isDebateClaimReuseEnabled', () => {
  it('is on by default and off for the usual falsy spellings, quoted or not', () => {
    vi.stubEnv('DEBATE_CLAIM_REUSE_ENABLED', '');
    expect(isDebateClaimReuseEnabled()).toBe(true);
    vi.stubEnv('DEBATE_CLAIM_REUSE_ENABLED', 'true');
    expect(isDebateClaimReuseEnabled()).toBe(true);
    vi.stubEnv('DEBATE_CLAIM_REUSE_ENABLED', 'false');
    expect(isDebateClaimReuseEnabled()).toBe(false);
    vi.stubEnv('DEBATE_CLAIM_REUSE_ENABLED', '"0"');
    expect(isDebateClaimReuseEnabled()).toBe(false);
    vi.stubEnv('DEBATE_CLAIM_REUSE_ENABLED', 'off');
    expect(isDebateClaimReuseEnabled()).toBe(false);
  });
});
