import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import type { Debate } from '../api';
import type { DebateClaimInput, DebatePublishTurn } from '../debate-publish-draft';
import { DebateNotPublishableError } from './debate-source';
import { decodeDedupPendingUntil } from './extracted-claims';
import {
  type PublishDebateClaimsDeps,
  isEarlyClaimPublishEnabled,
  publishDebateClaimsEarly,
} from './publish-debate-claims';

const DEBATE_ID = '019f89dc-2124-7991-93da-afd5bc4ffa0a';
const SPACE = 'c9f267dcb0d270718c2a3c45a64afd32';
const STABLE_A = '5e1f0c3a9b2d4e6f8a7b6c5d4e3f2a1b';
const STABLE_B = '6a2b3c4d5e6f40718293a4b5c6d7e8f9';
const EXISTING = '4f12f5ea073442cbaa0fb10f70a9a876';
const CONFIG = { privateKey: '0x01' as const, spaceId: 'acceptor-space' };
const SPACE_ROW = { id: SPACE, type: 'DAO', address: '0xspace' };

const turns: DebatePublishTurn[] = [
  { turnIndex: 0, speakerSpaceEntityId: 'yes', speakerName: 'A', text: 'First turn.' },
  { turnIndex: 1, speakerSpaceEntityId: 'no', speakerName: 'B', text: 'Second turn.' },
];

const claims: DebateClaimInput[] = [
  { text: 'Claim A.', isFactual: true, turnIndex: 0, stableEntityId: STABLE_A, isContestable: true },
  { text: 'Claim B.', isFactual: null, turnIndex: 1, stableEntityId: STABLE_B },
  { text: 'Matched.', isFactual: true, turnIndex: 1, existingClaimEntityId: EXISTING, stableEntityId: null },
];

const debate = {
  id: DEBATE_ID,
  status: 'complete',
  claim: { space_id: SPACE, claim_entity_id: 'motion', claim: 'The motion' },
} as unknown as Debate;

function deps(overrides: Partial<PublishDebateClaimsDeps> = {}) {
  const submit = vi.fn(async () => '0xhash');
  const prepareOps = vi.fn(async () => [{ type: 'op' }] as never);
  const base: Partial<PublishDebateClaimsDeps> = {
    getConfig: () => CONFIG,
    debateEntityExists: async () => false,
    loadDebate: async () => debate,
    loadEditableSpace: async () => SPACE_ROW,
    loadClaims: async () => ({ transcriptTurns: turns, claims }),
    applyReusePolicy: async input => input,
    lookupClaims: async () => [],
    prepareOps,
    submit,
  };
  return { deps: { ...base, ...overrides }, submit, prepareOps };
}

const asClaim = (id: string, space = SPACE) => ({ id, spaces: [space], types: [{ id: CLAIM_TYPE_ID }] });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('publishDebateClaimsEarly', () => {
  it('publishes the minted claims under their stable ids, as the acceptor, into the debate’s space', async () => {
    const { deps: d, submit, prepareOps } = deps();
    const result = await publishDebateClaimsEarly(DEBATE_ID, d);

    expect(result).toEqual({
      status: 'published',
      spaceId: SPACE,
      claimIds: [STABLE_A, STABLE_B],
      userOpHash: '0xhash',
    });
    const [draft] = prepareOps.mock.calls[0] as unknown as [{ claimIds: string[] }];
    expect(draft.claimIds).toEqual([STABLE_A, STABLE_B]);
    expect(submit).toHaveBeenCalledWith(CONFIG, {
      name: '2 claims from the debate on "The motion"',
      ops: [{ type: 'op' }],
      space: SPACE_ROW,
    });
  });

  it('publishes only the claims the graph does not have yet', async () => {
    const { deps: d, prepareOps } = deps({ lookupClaims: async () => [asClaim(STABLE_A)] });
    const result = await publishDebateClaimsEarly(DEBATE_ID, d);

    expect(result).toMatchObject({ status: 'published', claimIds: [STABLE_B] });
    const [draft] = prepareOps.mock.calls[0] as unknown as [{ claimIds: string[] }];
    expect(draft.claimIds).toEqual([STABLE_B]);
  });

  it('does not count an entity in another space, or not typed Claim, as published', async () => {
    const { deps: d } = deps({
      lookupClaims: async () => [
        asClaim(STABLE_A, 'ffffffffffffffffffffffffffffffff'),
        { ...asClaim(STABLE_B), types: [] },
      ],
    });
    expect(await publishDebateClaimsEarly(DEBATE_ID, d)).toMatchObject({ claimIds: [STABLE_A, STABLE_B] });
  });

  it('does nothing when every claim is already on the graph', async () => {
    const { deps: d, submit } = deps({ lookupClaims: async () => [asClaim(STABLE_A), asClaim(STABLE_B)] });
    expect(await publishDebateClaimsEarly(DEBATE_ID, d)).toEqual({ status: 'up_to_date', spaceId: SPACE });
    expect(submit).not.toHaveBeenCalled();
  });

  it('leaves a debate the full publish has written alone, before reading anything from geo-chat', async () => {
    const loadDebate = vi.fn(async () => debate);
    const { deps: d, submit } = deps({ debateEntityExists: async () => true, loadDebate });
    expect(await publishDebateClaimsEarly(DEBATE_ID, d)).toEqual({ status: 'debate_published' });
    expect(loadDebate).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('propagates the opt-out gate: a cancelled or unsettled debate publishes nothing', async () => {
    const loadClaims = vi.fn();
    const { deps: d, submit } = deps({
      loadDebate: async () => {
        throw new DebateNotPublishableError('recording_cancelled', 'cancelled');
      },
      loadClaims,
    });
    await expect(publishDebateClaimsEarly(DEBATE_ID, d)).rejects.toBeInstanceOf(DebateNotPublishableError);
    expect(loadClaims).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('mints nothing for claims the reuse policy keeps as references', async () => {
    const { deps: d, submit } = deps({
      applyReusePolicy: async input => input.map(claim => ({ ...claim, existingClaimEntityId: EXISTING })),
    });
    expect(await publishDebateClaimsEarly(DEBATE_ID, d)).toEqual({ status: 'no_claims' });
    expect(submit).not.toHaveBeenCalled();
  });

  it('passes the debate’s motion to the reuse policy, as the full publish does', async () => {
    const applyReusePolicy = vi.fn(async (input: DebateClaimInput[]) => input);
    const { deps: d } = deps({ applyReusePolicy });
    await publishDebateClaimsEarly(DEBATE_ID, d);
    expect(applyReusePolicy).toHaveBeenCalledWith(claims, SPACE, {
      debateId: DEBATE_ID,
      motionClaimEntityId: 'motion',
    });
  });

  it('publishes nothing while geo-chat’s paraphrase dedup may still merge a claim away', async () => {
    const now = Date.parse('2026-10-06T12:00:00.000Z');
    const loadEditableSpace = vi.fn(async () => SPACE_ROW);
    const { deps: d, submit } = deps({
      now: () => now,
      loadEditableSpace,
      loadClaims: async () => ({ transcriptTurns: turns, claims, dedupPendingUntil: now + 1 }),
    });
    expect(await publishDebateClaimsEarly(DEBATE_ID, d)).toEqual({ status: 'dedup_pending' });
    expect(loadEditableSpace).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('publishes once the dedup marker lapses, or when there is none', async () => {
    const now = Date.parse('2026-10-06T12:00:00.000Z');
    for (const dedupPendingUntil of [now, now - 1, null, undefined]) {
      const { deps: d } = deps({
        now: () => now,
        loadClaims: async () => ({ transcriptTurns: turns, claims, dedupPendingUntil }),
      });
      expect(await publishDebateClaimsEarly(DEBATE_ID, d)).toMatchObject({ status: 'published' });
    }
  });

  it('holds an unreadable dedup marker for the full publish', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps: d, submit } = deps({
      loadClaims: async () => ({
        transcriptTurns: turns,
        claims,
        dedupPendingUntil: decodeDedupPendingUntil('soon'),
      }),
    });
    expect(await publishDebateClaimsEarly(DEBATE_ID, d)).toEqual({ status: 'dedup_pending' });
    expect(submit).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reports no claims when geo-chat has none yet', async () => {
    const { deps: d } = deps({ loadClaims: async () => null });
    expect(await publishDebateClaimsEarly(DEBATE_ID, d)).toEqual({ status: 'no_claims' });
  });

  it('stops at a space the acceptor does not edit', async () => {
    const { deps: d, submit } = deps({ loadEditableSpace: async () => null });
    expect(await publishDebateClaimsEarly(DEBATE_ID, d)).toEqual({ status: 'not_editor', spaceId: SPACE });
    expect(submit).not.toHaveBeenCalled();
  });

  it('throws, rather than publishing everything again, when the graph cannot be read', async () => {
    const { deps: d, submit } = deps({
      lookupClaims: async () => {
        throw new Error('graph down');
      },
    });
    await expect(publishDebateClaimsEarly(DEBATE_ID, d)).rejects.toThrow('graph down');
    expect(submit).not.toHaveBeenCalled();
  });

  it('does nothing without an acceptor', async () => {
    const { deps: d } = deps({ getConfig: () => null });
    expect(await publishDebateClaimsEarly(DEBATE_ID, d)).toEqual({ status: 'acceptor_not_configured' });
  });
});

describe('isEarlyClaimPublishEnabled', () => {
  it('is on unless switched off', () => {
    expect(isEarlyClaimPublishEnabled()).toBe(true);
    vi.stubEnv('DEBATE_EARLY_CLAIM_PUBLISH_ENABLED', 'false');
    expect(isEarlyClaimPublishEnabled()).toBe(false);
    vi.stubEnv('DEBATE_EARLY_CLAIM_PUBLISH_ENABLED', 'true');
    expect(isEarlyClaimPublishEnabled()).toBe(true);
  });
});
