import { describe, expect, it, vi } from 'vitest';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import type { Relation, Value } from '~/core/types';

import type { Debate } from '../api';
import {
  type DebateClaimInput,
  type DebatePublishTurn,
  buildDebatePublishDraft,
  debateTranscriptEntityId,
  debateTurnBlockEntityId,
} from '../debate-publish-draft';
import {
  AUTHORS_PROPERTY_ID,
  BLOCKS_PROPERTY_ID,
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_TRANSCRIPTS_PROPERTY_ID,
  MARKDOWN_CONTENT_PROPERTY_ID,
  NAME_PROPERTY_ID,
  SOURCES_PROPERTY_ID,
  TYPES_PROPERTY_ID,
} from '../ontology';
import { DebateNotPublishableError } from './debate-source';
import {
  HOLD_BEST_SCORE,
  type PublishMissingDebateClaimsDeps,
  type PublishedBlocks,
  publishMissingDebateClaims,
  publishedBlocksFrom,
  selectLateClaimOps,
} from './publish-missing-debate-claims';

const DEBATE_ID = '01a1d0d5-7658-7fc0-9bff-0447f535f4b0';
const DEBATE_KEY = ID.uuidToHex(DEBATE_ID);
const SPACE = 'c9f267dcb0d270718c2a3c45a64afd32';
const MOTION = '0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a';
const YES = '1111111111111111111111111111111a';
const NO = '2222222222222222222222222222222b';
const STABLE_A = '5e1f0c3a9b2d4e6f8a7b6c5d4e3f2a1b';
const STABLE_B = '6a2b3c4d5e6f40718293a4b5c6d7e8f9';
const EXISTING = '4f12f5ea073442cbaa0fb10f70a9a876';
const TOPIC = '9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d9d';
const CONFIG = { privateKey: '0x01' as const, spaceId: 'acceptor-space' };
const SPACE_ROW = { id: SPACE, type: 'DAO', address: '0xspace' };

const BLOCK_0 = debateTurnBlockEntityId(DEBATE_KEY, 0);
const BLOCK_1 = debateTurnBlockEntityId(DEBATE_KEY, 1);
const TRANSCRIPT = debateTranscriptEntityId(DEBATE_KEY);

const turns: DebatePublishTurn[] = [
  { turnIndex: 0, speakerSpaceEntityId: YES, speakerName: 'A', text: 'First turn, as re-extracted.' },
  { turnIndex: 1, speakerSpaceEntityId: NO, speakerName: 'B', text: 'Second turn.' },
];

const claimA: DebateClaimInput = {
  text: 'Claim A.',
  isFactual: true,
  turnIndex: 0,
  stableEntityId: STABLE_A,
  topics: [{ id: TOPIC, name: 'Topic' }],
  stance: 'supports',
  timing: { startMs: 1000, endMs: 4000 },
  highlightScore: 0.7,
};
const claimB: DebateClaimInput = { text: 'Claim B.', isFactual: null, turnIndex: 1, stableEntityId: STABLE_B };
const matched: DebateClaimInput = {
  text: 'Matched.',
  isFactual: true,
  turnIndex: 1,
  existingClaimEntityId: EXISTING,
  stableEntityId: null,
  topics: [{ id: TOPIC, name: 'Topic' }],
};

const debate = {
  id: DEBATE_ID,
  status: 'complete',
  claim: { space_id: SPACE, claim_entity_id: MOTION, claim: 'The motion' },
  participants: [
    { profile_space_id: YES, display_name: 'A', position: true, participant_slot: 0 },
    { profile_space_id: NO, display_name: 'B', position: false, participant_slot: 1 },
  ],
} as unknown as Debate;

/** The graph as the full publish left it: both blocks, published text, no claim links. */
function publishedBlocks(overrides: Partial<PublishedBlocks> = {}): PublishedBlocks {
  return {
    markdown: new Map([
      [BLOCK_0, 'First turn, as served.'],
      [BLOCK_1, 'Second turn.'],
    ]),
    transcriptBlocks: [BLOCK_0, BLOCK_1],
    authors: new Map([
      [BLOCK_0, [YES]],
      [BLOCK_1, [NO]],
    ]),
    claimLinks: new Map(),
    ...overrides,
  };
}

const servedTurns: DebatePublishTurn[] = [
  { turnIndex: 0, speakerSpaceEntityId: YES, speakerName: 'A', text: 'First turn, as served.' },
  { turnIndex: 1, speakerSpaceEntityId: NO, speakerName: 'B', text: 'Second turn.' },
];

function deps(overrides: Partial<PublishMissingDebateClaimsDeps> = {}) {
  const submit = vi.fn(async (_config: unknown, _edit: unknown, onSubmitted?: () => void) => {
    onSubmitted?.();
    return '0xhash';
  });
  const prepareOps = vi.fn(async () => [{ type: 'op' }] as never);
  const applyReusePolicy = vi.fn(async (input: DebateClaimInput[], ..._rest: unknown[]) => input);
  const applyStancePolicy = vi.fn(async (input: DebateClaimInput[], ..._rest: unknown[]) => input);
  const base: Partial<PublishMissingDebateClaimsDeps> = {
    getConfig: () => CONFIG,
    debateEntityExists: async () => true,
    loadDebate: async () => debate,
    loadClaims: async () => ({ transcriptTurns: turns, claims: [claimA, claimB] }),
    loadServedTurns: async () => servedTurns,
    loadEditableSpace: async () => SPACE_ROW,
    applyReusePolicy: applyReusePolicy as never,
    applyStancePolicy: applyStancePolicy as never,
    lookupClaims: async () => [],
    readBlocks: async () => publishedBlocks(),
    prepareOps,
    submit: submit as never,
    withLease: async (_id, run) => ({ ran: true, value: await run(() => {}) }),
    now: () => Date.parse('2026-11-13T00:00:00Z'),
  };
  return { deps: { ...base, ...overrides }, submit, prepareOps, applyReusePolicy, applyStancePolicy };
}

const k = (id: string) => id.replace(/-/g, '').toLowerCase();
const relationKey = (r: Relation) => `${r.id}|${k(r.type.id)}|${k(r.fromEntity.id)}|${k(r.toEntity.id)}`;
const valueKey = (v: Value) => `${k(v.entity.id)}|${k(v.property.id)}|${v.value}`;

/** The values and relations handed to `prepareOps` on the first call. */
function submitted(prepareOps: ReturnType<typeof deps>['prepareOps']) {
  const [values, relations] = prepareOps.mock.calls[0] as unknown as [Value[], Relation[]];
  return { values, relations };
}

async function dryPlan(d: Partial<PublishMissingDebateClaimsDeps>, blockText: 'keep' | 'rewrite' = 'keep') {
  const result = await publishMissingDebateClaims(DEBATE_ID, { dryRun: true, blockText }, d);
  if (!('plan' in result)) throw new Error(`no plan: ${result.status}`);
  return result;
}

describe('selectLateClaimOps', () => {
  const fullDraft = () =>
    buildDebatePublishDraft({
      debateId: DEBATE_ID,
      spaceId: SPACE,
      claimEntityId: MOTION,
      claimText: 'The motion',
      participants: [
        { spaceEntityId: YES, displayName: 'A', position: true, participantSlot: 0 },
        { spaceEntityId: NO, displayName: 'B', position: false, participantSlot: 1 },
      ],
      videoUrl: 'https://example.com/video',
      keyframeUrl: 'https://example.com/still',
      ogImageUrl: 'ipfs://card',
      transcriptTurns: turns,
      claims: [claimA, claimB],
      tagClaimAsDebate: true,
      claimTopics: [{ id: TOPIC, name: 'Topic' }],
    });

  it('keeps exactly the full draft’s ops for the selected claims, under the same ids', () => {
    const draft = fullDraft();
    const selected = selectLateClaimOps(draft, {
      statements: [
        { blockId: BLOCK_0, claimId: STABLE_A },
        { blockId: BLOCK_1, claimId: STABLE_B },
      ],
      minted: new Set([STABLE_A, STABLE_B]),
      matched: new Set(),
      rewriteBlocks: new Set(),
    });

    // Every op that describes a claim or its statement in the full draft, and nothing else.
    const statementEntities = new Set(
      draft.relations.filter(r => k(r.type.id) === k(DEBATE_CLAIMS_PROPERTY_ID)).map(r => k(r.entityId))
    );
    const claimIds = new Set([k(STABLE_A), k(STABLE_B)]);
    const expectedRelations = draft.relations.filter(
      r =>
        (k(r.type.id) === k(DEBATE_CLAIMS_PROPERTY_ID) && claimIds.has(k(r.toEntity.id))) ||
        statementEntities.has(k(r.fromEntity.id)) ||
        claimIds.has(k(r.fromEntity.id))
    );
    const expectedValues = draft.values.filter(
      v => claimIds.has(k(v.entity.id)) || statementEntities.has(k(v.entity.id))
    );
    expect(selected.relations.map(relationKey).sort()).toEqual(expectedRelations.map(relationKey).sort());
    expect(selected.values.map(valueKey).sort()).toEqual(expectedValues.map(valueKey).sort());
    // And the selection really covers the claim: Types, Topics, Sources, stance, offsets, score.
    expect(selected.relations.some(r => k(r.type.id) === k(TOPICS_PROPERTY_ID))).toBe(true);
    expect(selected.values.some(v => k(v.property.id) === k(CLAIM_IS_FACTUAL_PROPERTY_ID))).toBe(true);
    expect(selected.values.length).toBeGreaterThan(4);
  });

  it('never writes the Debate, its Transcript, Video, share card, participants or the blocks', () => {
    const draft = fullDraft();
    const selected = selectLateClaimOps(draft, {
      statements: [{ blockId: BLOCK_0, claimId: STABLE_A }],
      minted: new Set([STABLE_A]),
      matched: new Set(),
      rewriteBlocks: new Set(),
    });
    const touched = new Set([
      ...selected.values.map(v => k(v.entity.id)),
      // The block → claim statement is the one relation a block is the source of.
      ...selected.relations.filter(r => k(r.type.id) !== k(DEBATE_CLAIMS_PROPERTY_ID)).map(r => k(r.fromEntity.id)),
    ]);
    for (const id of [DEBATE_KEY, TRANSCRIPT, BLOCK_0, BLOCK_1, MOTION]) expect(touched.has(k(id))).toBe(false);
    expect(selected.relations.some(r => k(r.type.id) === k(DEBATE_TRANSCRIPTS_PROPERTY_ID))).toBe(false);
    // Only claim A: claim B's statement and description are left out.
    expect(touched.has(k(STABLE_B))).toBe(false);
  });

  it('writes links only for a claim whose entity exists: no Name, Types or Topics', () => {
    const selected = selectLateClaimOps(fullDraft(), {
      statements: [{ blockId: BLOCK_0, claimId: STABLE_A }],
      minted: new Set(),
      matched: new Set(),
      rewriteBlocks: new Set(),
    });
    expect(selected.values.some(v => k(v.entity.id) === k(STABLE_A))).toBe(false);
    const fromClaim = selected.relations.filter(r => k(r.fromEntity.id) === k(STABLE_A)).map(r => k(r.type.id));
    expect(fromClaim).toContain(k(SOURCES_PROPERTY_ID));
    expect(fromClaim).not.toContain(k(TYPES_PROPERTY_ID));
    expect(fromClaim).not.toContain(k(TOPICS_PROPERTY_ID));
    expect(selected.relations.some(r => k(r.type.id) === k(DEBATE_CLAIMS_PROPERTY_ID))).toBe(true);
  });

  it('rewrites only the Markdown content of a selected block', () => {
    const selected = selectLateClaimOps(fullDraft(), {
      statements: [],
      minted: new Set(),
      matched: new Set(),
      rewriteBlocks: new Set([BLOCK_0]),
    });
    expect(selected.relations).toEqual([]);
    expect(selected.values.map(v => [k(v.entity.id), k(v.property.id), v.value])).toEqual([
      [k(BLOCK_0), k(MARKDOWN_CONTENT_PROPERTY_ID), 'First turn, as re-extracted.'],
    ]);
  });
});

describe('publishMissingDebateClaims', () => {
  it('submits the same ids the full publish writes for those claims', async () => {
    const { deps: d, prepareOps } = deps({
      loadClaims: async () => ({ transcriptTurns: turns, claims: [claimA, claimB, matched] }),
    });
    const { plan } = await dryPlan(d);
    await publishMissingDebateClaims(DEBATE_ID, { dryRun: false, expect: plan.fingerprint }, d);
    const late = submitted(prepareOps);

    // What `publishDebateAsAcceptor` would have built for this debate: media, share card, motion
    // topics and the debate tag included, so nothing about them may shift a claim's ids.
    const full = buildDebatePublishDraft({
      debateId: DEBATE_ID,
      spaceId: SPACE,
      claimEntityId: MOTION,
      claimText: 'The motion',
      participants: [
        { spaceEntityId: YES, displayName: 'A', position: true, participantSlot: 0 },
        { spaceEntityId: NO, displayName: 'B', position: false, participantSlot: 1 },
      ],
      videoUrl: 'https://example.com/video',
      keyframeUrl: 'https://example.com/still',
      ogImageUrl: 'ipfs://card',
      transcriptTurns: turns,
      claims: [claimA, claimB, matched],
      tagClaimAsDebate: true,
      claimTopics: [{ id: TOPIC, name: 'Topic' }],
    });
    const fullRelationIds = new Map(full.relations.map(r => [r.id, relationKey(r)]));
    const fullValueKeys = new Set(full.values.map(v => `${v.id}|${valueKey(v)}`));
    expect(late.relations.length).toBeGreaterThan(0);
    for (const relation of late.relations) expect(fullRelationIds.get(relation.id)).toBe(relationKey(relation));
    for (const value of late.values) expect(fullValueKeys.has(`${value.id}|${valueKey(value)}`)).toBe(true);
    // And every claim op of the full publish is in the late edit (matched: no Name/Types).
    const claimIds = new Set([k(STABLE_A), k(STABLE_B), k(EXISTING)]);
    const lateIds = new Set(late.relations.map(r => r.id));
    const missing = full.relations.filter(
      r =>
        (claimIds.has(k(r.fromEntity.id)) ||
          (k(r.type.id) === k(DEBATE_CLAIMS_PROPERTY_ID) && claimIds.has(k(r.toEntity.id)))) &&
        !lateIds.has(r.id)
    );
    expect(missing).toEqual([]);
  });

  it('dry run: lists every missing statement and submits nothing', async () => {
    const { deps: d, submit } = deps();
    const result = await dryPlan(d);
    expect(result.status).toBe('dry_run');
    expect(result.plan.statements).toEqual([
      { claimId: STABLE_A, turnIndex: 0, text: 'Claim A.', minted: true, matched: false },
      { claimId: STABLE_B, turnIndex: 1, text: 'Claim B.', minted: true, matched: false },
    ]);
    expect(result.plan.opCount).toBeGreaterThan(0);
    expect(result.plan.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(submit).not.toHaveBeenCalled();
  });

  it('apply: submits the edit as the acceptor when the fingerprint matches the dry run', async () => {
    const { deps: d, submit, prepareOps } = deps();
    const { plan } = await dryPlan(d);
    const result = await publishMissingDebateClaims(DEBATE_ID, { dryRun: false, expect: plan.fingerprint }, d);
    expect(result).toMatchObject({ status: 'published', userOpHash: '0xhash' });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]?.[1]).toMatchObject({
      name: '2 claims added to the debate on "The motion"',
      space: SPACE_ROW,
    });
    const { values } = submitted(prepareOps);
    expect(values.some(v => k(v.entity.id) === k(STABLE_A) && k(v.property.id) === k(NAME_PROPERTY_ID))).toBe(true);
  });

  it('apply: refuses when the plan changed since the dry run', async () => {
    const { deps: d, submit } = deps();
    const result = await publishMissingDebateClaims(DEBATE_ID, { dryRun: false, expect: 'stale' }, d);
    expect(result).toMatchObject({ status: 'changed_since_dry_run', expected: 'stale' });
    expect(submit).not.toHaveBeenCalled();
  });

  it('apply: waits while an earlier late publish of the debate holds the lease', async () => {
    const { deps: d, submit } = deps({ withLease: async () => ({ ran: false }) });
    expect(await publishMissingDebateClaims(DEBATE_ID, { dryRun: false, expect: 'x' }, d)).toEqual({
      status: 'submission_pending',
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it('leaves a debate the full publish has not written to the full publish', async () => {
    const loadDebate = vi.fn(async () => debate);
    const { deps: d } = deps({ debateEntityExists: async () => false, loadDebate });
    expect(await publishMissingDebateClaims(DEBATE_ID, {}, d)).toEqual({ status: 'debate_not_published' });
    expect(loadDebate).not.toHaveBeenCalled();
  });

  it('reports the terminal and waiting states', async () => {
    expect(await publishMissingDebateClaims(DEBATE_ID, {}, deps({ getConfig: () => null }).deps)).toEqual({
      status: 'acceptor_not_configured',
    });
    expect(await publishMissingDebateClaims(DEBATE_ID, {}, deps({ loadClaims: async () => null }).deps)).toEqual({
      status: 'no_claims',
    });
    expect(
      await publishMissingDebateClaims(
        DEBATE_ID,
        {},
        deps({
          loadClaims: async () => ({
            transcriptTurns: turns,
            claims: [claimA],
            dedupPendingUntil: Date.parse('2026-11-13T00:05:00Z'),
          }),
        }).deps
      )
    ).toEqual({ status: 'dedup_pending' });
    expect(await publishMissingDebateClaims(DEBATE_ID, {}, deps({ loadEditableSpace: async () => null }).deps)).toEqual(
      { status: 'not_editor', spaceId: SPACE }
    );
  });

  it('propagates the opt-out gate and failed reads instead of reading them as "nothing there"', async () => {
    const gate = deps({
      loadDebate: async () => {
        throw new DebateNotPublishableError('recording_cancelled', 'cancelled');
      },
    });
    await expect(publishMissingDebateClaims(DEBATE_ID, {}, gate.deps)).rejects.toBeInstanceOf(
      DebateNotPublishableError
    );
    const graph = deps({
      readBlocks: async () => {
        throw new Error('graph down');
      },
    });
    await expect(publishMissingDebateClaims(DEBATE_ID, {}, graph.deps)).rejects.toThrow('graph down');
  });

  it('runs the reuse and stance policies strict', async () => {
    const { deps: d, applyReusePolicy, applyStancePolicy } = deps();
    await dryPlan(d);
    expect(applyReusePolicy.mock.calls[0]?.[2]).toMatchObject({ strict: true, motionClaimEntityId: MOTION });
    expect(applyStancePolicy.mock.calls[0]?.[3]).toMatchObject({ strict: true });
  });

  it('leaves a claim the debate already links alone, and lists it when geo-chat moved it to another turn', async () => {
    const { deps: d } = deps({
      readBlocks: async () => publishedBlocks({ claimLinks: new Map([[BLOCK_1, [STABLE_A]]]) }),
    });
    const { plan } = await dryPlan(d);
    expect(plan.statements.map(s => s.claimId)).toEqual([STABLE_B]);
    expect(plan.turnMoved).toEqual([{ claimId: STABLE_A, text: 'Claim A.', linkedTurns: [1], geoChatTurns: [0] }]);
  });

  it('links each statement of a claim said in two turns', async () => {
    const twice = { ...claimA, turnIndex: 1 };
    const { deps: d, prepareOps } = deps({
      loadClaims: async () => ({ transcriptTurns: turns, claims: [claimA, twice] }),
    });
    const { plan } = await dryPlan(d);
    expect(plan.statements.map(s => [s.turnIndex, s.claimId])).toEqual([
      [0, STABLE_A],
      [1, STABLE_A],
    ]);
    await publishMissingDebateClaims(DEBATE_ID, { dryRun: false, expect: plan.fingerprint }, d);
    const { relations, values } = submitted(prepareOps);
    const links = relations.filter(r => k(r.type.id) === k(DEBATE_CLAIMS_PROPERTY_ID));
    expect(links.map(r => k(r.fromEntity.id)).sort()).toEqual([k(BLOCK_0), k(BLOCK_1)].sort());
    // Minted once.
    expect(values.filter(v => k(v.entity.id) === STABLE_A && k(v.property.id) === k(NAME_PROPERTY_ID))).toHaveLength(1);
  });

  it.each([
    ['a turn with no block', { markdown: new Map([[BLOCK_1, 'Second turn.']]), transcriptBlocks: [BLOCK_1] }],
    ['an extra block', { transcriptBlocks: [BLOCK_0, BLOCK_1, 'ffffffffffffffffffffffffffffffff'] }],
    ['a block listed twice', { transcriptBlocks: [BLOCK_0, BLOCK_1, BLOCK_1] }],
    [
      'blocks authored by the other speaker (turns shifted by a re-render)',
      {
        authors: new Map([
          [BLOCK_0, [NO]],
          [BLOCK_1, [YES]],
        ]),
      },
    ],
    [
      'a co-author',
      {
        authors: new Map([
          [BLOCK_0, [YES, NO]],
          [BLOCK_1, [NO]],
        ]),
      },
    ],
  ])('links and rewrites nothing when the published transcript has %s', async (_, overrides) => {
    const { deps: d, submit } = deps({
      readBlocks: async () => publishedBlocks(overrides as Partial<PublishedBlocks>),
    });
    const result = await dryPlan(d, 'rewrite');
    expect(result.status).toBe('up_to_date');
    expect(result.plan.structure).toBe('mismatch');
    expect(result.plan.statements).toEqual([]);
    expect(result.plan.skipped.map(s => [s.claimId, s.reason])).toEqual([
      [STABLE_A, 'block_structure_mismatch'],
      [STABLE_B, 'block_structure_mismatch'],
    ]);
    expect(result.plan.blockRewrites).toEqual([]);
    expect(submit).not.toHaveBeenCalled();
  });

  it('links an existing claim entity without describing it again', async () => {
    const { deps: d, prepareOps } = deps({
      lookupClaims: async () => [{ id: STABLE_A, spaces: [SPACE], types: [{ id: CLAIM_TYPE_ID }] }],
    });
    const { plan } = await dryPlan(d);
    expect(plan.statements[0]).toMatchObject({ claimId: STABLE_A, minted: false });
    await publishMissingDebateClaims(DEBATE_ID, { dryRun: false, expect: plan.fingerprint }, d);
    const { values, relations } = submitted(prepareOps);
    expect(values.some(v => k(v.entity.id) === k(STABLE_A))).toBe(false);
    const fromA = relations.filter(r => k(r.fromEntity.id) === k(STABLE_A)).map(r => k(r.type.id));
    expect(fromA).not.toContain(k(TYPES_PROPERTY_ID));
    expect(fromA).not.toContain(k(TOPICS_PROPERTY_ID));
    expect(fromA).toContain(k(SOURCES_PROPERTY_ID));
  });

  it('counts an entity in another space, or not typed Claim, as missing', async () => {
    const { deps: d } = deps({
      lookupClaims: async () => [
        { id: STABLE_A, spaces: ['ffffffffffffffffffffffffffffffff'], types: [{ id: CLAIM_TYPE_ID }] },
        { id: STABLE_B, spaces: [SPACE], types: [] },
      ],
    });
    const { plan } = await dryPlan(d);
    expect(plan.statements.every(s => s.minted)).toBe(true);
  });

  it('links a matched claim to its published entity with the Topics the reuse policy left', async () => {
    const { deps: d, prepareOps } = deps({
      loadClaims: async () => ({ transcriptTurns: turns, claims: [matched] }),
    });
    const { plan } = await dryPlan(d);
    expect(plan.statements).toEqual([
      { claimId: EXISTING, turnIndex: 1, text: 'Matched.', minted: false, matched: true },
    ]);
    await publishMissingDebateClaims(DEBATE_ID, { dryRun: false, expect: plan.fingerprint }, d);
    const { values, relations } = submitted(prepareOps);
    expect(values.some(v => k(v.entity.id) === EXISTING)).toBe(false);
    expect(relations.some(r => k(r.fromEntity.id) === EXISTING && k(r.type.id) === k(TOPICS_PROPERTY_ID))).toBe(true);
  });

  it('holds a failed-match claim next to a near-identical published claim, and nothing else', async () => {
    const close = { ...claimA, matchVerdict: 'error', matchBestScore: HOLD_BEST_SCORE };
    const far = { ...claimB, matchVerdict: 'error', matchBestScore: 0.9 };
    const { deps: d, prepareOps } = deps({
      loadClaims: async () => ({ transcriptTurns: turns, claims: [close, far] }),
    });
    const { plan } = await dryPlan(d);
    expect(plan.held).toEqual([{ claimId: STABLE_A, text: 'Claim A.', bestScore: HOLD_BEST_SCORE }]);
    expect(plan.statements.map(s => s.claimId)).toEqual([STABLE_B]);
    await publishMissingDebateClaims(DEBATE_ID, { dryRun: false, expect: plan.fingerprint }, d);
    const { values, relations } = submitted(prepareOps);
    expect([...values.map(v => k(v.entity.id)), ...relations.map(r => k(r.toEntity.id))]).not.toContain(STABLE_A);
  });

  it('does not hold a failed-match claim the debate already links', async () => {
    const close = { ...claimA, matchVerdict: 'error', matchBestScore: 0.99 };
    const { deps: d } = deps({
      loadClaims: async () => ({ transcriptTurns: turns, claims: [close, claimB] }),
      readBlocks: async () => publishedBlocks({ claimLinks: new Map([[BLOCK_0, [STABLE_A]]]) }),
    });
    const { plan } = await dryPlan(d);
    expect(plan.held).toEqual([]);
  });

  it('does not hold a failed-match claim whose entity is already a Claim in the space (nothing is minted)', async () => {
    const close = { ...claimA, matchVerdict: 'error', matchBestScore: 0.99 };
    const { deps: d } = deps({
      loadClaims: async () => ({ transcriptTurns: turns, claims: [close, claimB] }),
      lookupClaims: async () => [{ id: STABLE_A, spaces: [SPACE], types: [{ id: CLAIM_TYPE_ID }] }],
    });
    const { plan } = await dryPlan(d);
    expect(plan.held).toEqual([]);
    expect(plan.statements[0]).toMatchObject({ claimId: STABLE_A, minted: false });
  });

  it('skips a new claim on a block that links a claim geo-chat no longer lists (a lost match)', async () => {
    const { deps: d } = deps({
      readBlocks: async () => publishedBlocks({ claimLinks: new Map([[BLOCK_0, [EXISTING]]]) }),
    });
    const { plan } = await dryPlan(d);
    expect(plan.unlistedLinks).toEqual([{ turnIndex: 0, claimIds: [EXISTING] }]);
    expect(plan.skipped).toEqual([
      { claimId: STABLE_A, turnIndex: 0, text: 'Claim A.', reason: 'block_links_unlisted_claim' },
    ]);
    expect(plan.statements.map(s => s.claimId)).toEqual([STABLE_B]);
  });

  it('skips an existing or matched claim on such a block too: the unlisted id may be the same sentence', async () => {
    const { deps: d } = deps({
      loadClaims: async () => ({ transcriptTurns: turns, claims: [claimA, { ...matched, turnIndex: 0 }, claimB] }),
      readBlocks: async () =>
        publishedBlocks({ claimLinks: new Map([[BLOCK_0, ['ffffffffffffffffffffffffffffffff']]]) }),
      lookupClaims: async () => [{ id: STABLE_A, spaces: [SPACE], types: [{ id: CLAIM_TYPE_ID }] }],
    });
    const { plan } = await dryPlan(d);
    expect(plan.skipped.map(s => [s.claimId, s.reason])).toEqual([
      [STABLE_A, 'block_links_unlisted_claim'],
      [EXISTING, 'block_links_unlisted_claim'],
    ]);
    expect(plan.statements.map(s => s.claimId)).toEqual([STABLE_B]);
  });

  it('fingerprint changes when a claim is reworded, restanced or retimed under the same id', async () => {
    const base = (await dryPlan(deps().deps)).plan.fingerprint;
    const variants = [
      { ...claimA, text: 'Claim A, reworded.' },
      { ...claimA, stance: 'opposes' as const },
      { ...claimA, timing: { startMs: 1000, endMs: 5000 } },
      { ...claimA, topics: [] },
    ];
    const prints = await Promise.all(
      variants.map(
        async variant =>
          (
            await dryPlan(
              deps({ loadClaims: async () => ({ transcriptTurns: turns, claims: [variant, claimB] }) }).deps
            )
          ).plan.fingerprint
      )
    );
    expect(new Set([base, ...prints]).size).toBe(variants.length + 1);
    // And it is stable across builds of the same plan (positions are left out).
    expect((await dryPlan(deps().deps)).plan.fingerprint).toBe(base);
  });

  it('skips a claim with no stable id rather than minting a fresh one', async () => {
    const legacy = { ...claimB, stableEntityId: null };
    const { deps: d } = deps({ loadClaims: async () => ({ transcriptTurns: turns, claims: [claimA, legacy] }) });
    const { plan } = await dryPlan(d);
    expect(plan.skipped).toEqual([{ claimId: null, turnIndex: 1, text: 'Claim B.', reason: 'no_stable_id' }]);
    expect(plan.statements.map(s => s.claimId)).toEqual([STABLE_A]);
  });

  it('is up to date when every statement is linked', async () => {
    const { deps: d } = deps({
      readBlocks: async () =>
        publishedBlocks({
          claimLinks: new Map([
            [BLOCK_0, [STABLE_A]],
            [BLOCK_1, [STABLE_B]],
          ]),
        }),
    });
    const result = await publishMissingDebateClaims(DEBATE_ID, { dryRun: true }, d);
    expect(result).toMatchObject({ status: 'up_to_date', plan: { opCount: 0 } });
  });

  describe('block text', () => {
    it('keep: reports the drift and leaves the text', async () => {
      const { deps: d } = deps();
      const { plan } = await dryPlan(d, 'keep');
      expect(plan.driftedTurns).toEqual([0]);
      expect(plan.blockRewrites).toEqual([]);
      expect(plan.structure).toBe('lines_up');
    });

    it('rewrite: sets a drifted block’s Markdown to geo-chat’s turn text when the structure lines up', async () => {
      const { deps: d, prepareOps } = deps();
      const { plan } = await dryPlan(d, 'rewrite');
      expect(plan.structure).toBe('lines_up');
      expect(plan.blockRewrites).toEqual([
        { turnIndex: 0, blockId: BLOCK_0, before: 'First turn, as served.', after: 'First turn, as re-extracted.' },
      ]);
      await publishMissingDebateClaims(DEBATE_ID, { dryRun: false, expect: plan.fingerprint, blockText: 'rewrite' }, d);
      const { values, relations } = submitted(prepareOps);
      expect(values.filter(v => k(v.entity.id) === k(BLOCK_0)).map(v => [k(v.property.id), v.value])).toEqual([
        [k(MARKDOWN_CONTENT_PROPERTY_ID), 'First turn, as re-extracted.'],
      ]);
      expect(values.some(v => k(v.entity.id) === k(BLOCK_1))).toBe(false);
      expect(
        relations.some(r => k(r.fromEntity.id) === k(BLOCK_0) && k(r.type.id) !== k(DEBATE_CLAIMS_PROPERTY_ID))
      ).toBe(false);
    });

    it('rewrite: keeps a block someone edited on the graph', async () => {
      const { deps: d } = deps({
        readBlocks: async () =>
          publishedBlocks({
            markdown: new Map([
              [BLOCK_0, 'A person corrected this.'],
              [BLOCK_1, 'Second turn.'],
            ]),
          }),
      });
      const { plan } = await dryPlan(d, 'rewrite');
      expect(plan.blockRewrites).toEqual([]);
      expect(plan.rewriteSkipped).toEqual([{ turnIndex: 0, reason: 'edited_on_graph' }]);
    });

    it('fingerprint changes with the text before and after the rewrite', async () => {
      const base = (await dryPlan(deps().deps, 'rewrite')).plan.fingerprint;
      const newText = (
        await dryPlan(
          deps({
            loadClaims: async () => ({
              transcriptTurns: [{ ...turns[0]!, text: 'Different re-extraction.' }, turns[1]!],
              claims: [claimA, claimB],
            }),
          }).deps,
          'rewrite'
        )
      ).plan.fingerprint;
      const served = [{ ...servedTurns[0]!, text: 'Other served.' }, servedTurns[1]!];
      const oldText = (
        await dryPlan(
          deps({
            loadServedTurns: async () => served,
            readBlocks: async () =>
              publishedBlocks({
                markdown: new Map([
                  [BLOCK_0, 'Other served.'],
                  [BLOCK_1, 'Second turn.'],
                ]),
              }),
          }).deps,
          'rewrite'
        )
      ).plan.fingerprint;
      expect(new Set([base, newText, oldText]).size).toBe(3);
    });
  });
});

describe('publishedBlocksFrom', () => {
  it('reads blocks in the space, their text, the transcript’s list, authors and claim links', () => {
    const other = 'ffffffffffffffffffffffffffffffff';
    const blocks = publishedBlocksFrom(
      [BLOCK_0, BLOCK_1],
      TRANSCRIPT,
      SPACE,
      {
        entities: [
          { id: BLOCK_0, spaceIds: [SPACE] },
          { id: BLOCK_1, spaceIds: [other] },
        ],
        values: [
          { entityId: BLOCK_0, text: 'Text' },
          { entityId: BLOCK_1, text: 'Elsewhere' },
        ],
      },
      [
        { fromEntityId: TRANSCRIPT, typeId: BLOCKS_PROPERTY_ID, toEntityId: BLOCK_0 },
        { fromEntityId: BLOCK_0, typeId: AUTHORS_PROPERTY_ID, toEntityId: YES },
        { fromEntityId: BLOCK_0, typeId: DEBATE_CLAIMS_PROPERTY_ID, toEntityId: STABLE_A },
      ]
    );
    expect([...blocks.markdown]).toEqual([[k(BLOCK_0), 'Text']]);
    expect(blocks.transcriptBlocks).toEqual([k(BLOCK_0)]);
    expect([...blocks.authors]).toEqual([[k(BLOCK_0), [YES]]]);
    expect([...blocks.claimLinks]).toEqual([[k(BLOCK_0), [STABLE_A]]]);
  });
});
