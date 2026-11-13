import type { Op } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';
import { createHash } from 'node:crypto';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';
import { getEntity } from '~/core/io/queries';
import type { Relation, Value } from '~/core/types';
import { Publish } from '~/core/utils/publish';

import type { Debate } from '../api';
import {
  CLAIM_STANCE_PROPERTY_IDS,
  type DebateClaimInput,
  type DebatePublishDraft,
  type DebatePublishTurn,
  buildDebatePublishDraft,
  debateTranscriptEntityId,
  debateTurnBlockEntityId,
} from '../debate-publish-draft';
import {
  AUTHORS_PROPERTY_ID,
  BLOCKS_PROPERTY_ID,
  DEBATE_CLAIMS_PROPERTY_ID,
  MARKDOWN_CONTENT_PROPERTY_ID,
  SOURCES_PROPERTY_ID,
  TYPES_PROPERTY_ID,
} from '../ontology';
import { type DebateAcceptorConfig, getDebateAcceptorConfig } from './acceptor-config';
import { upstashStore } from './acceptor-lock';
import { type ExistingClaimLookup, applyClaimReusePolicy, lookupExistingClaimsInGraph } from './claim-reuse';
import { applyClaimStancePolicy } from './claim-stance';
import { loadDebateClaims, loadServedTranscriptTurns, loadSettledDebate } from './debate-source';
import { isDedupSettled } from './extracted-claims';
import { loadAcceptorEditableSpace, submitEditAsAcceptor } from './publish-debate';
import { withDebatePublishLease } from './publish-lease';
import { type RelationTarget, collectRelationTargets } from './relation-targets';

/**
 * GEO-3635: claims geo-chat adds to a debate after the debate is already on the graph.
 *
 * Both other publish paths stop once the Debate entity exists: the full publish
 * (`publishDebateAsAcceptor`) because it wrote the claims it had, the early claims publish
 * (`publishDebateClaimsEarly`) because the full publish would write them. A claims rewrite after
 * that (the moment backfill's Extracted/Reextracted paths, an operator re-render) leaves claims in
 * geo-chat, and moments cut from them, that the graph never gets.
 *
 * This writes exactly what the full publish would have written for the missing claims and nothing
 * else: the full draft is built from geo-chat's current claims and then filtered down to the
 * statements (block → claim `Claims` relations, with their offsets, scores and Selector) that the
 * graph lacks, and the claims behind them. Every id in the draft is derived from the debate or from
 * geo-chat's stable claim id, so these are the ids a full publish would use, and a second write is
 * an update. Never the Debate, Transcript, Video, share card, participants or the debate tag.
 *
 * What it leaves alone, by decision (GEO-3635, Preston, 13 Nov):
 * - a claim the debate already links from some block stays where it is, even if geo-chat now places
 *   it on another turn (reported as `turnMoved`);
 * - an existing claim entity gets links only: its Name, Types, Is factual and Topics are not
 *   rewritten, so a person's edit to them is never undone;
 * - a claim geo-chat could not match (judge `error`) while a near-identical claim exists is held for
 *   review (`held`) rather than minted as a likely duplicate.
 *
 * Optionally (`blockText: 'rewrite'`), a published turn block whose text is still the machine text
 * of geo-chat's served transcript, but differs from the turn text the claims came from, gets that
 * turn text. Only the Markdown value, and only when the published transcript's structure matches
 * geo-chat's turns one for one.
 *
 * Fails closed: every graph and geo-chat read it decides on throws on failure, and the reuse and
 * stance policies run strict. A failed read means "try again", never "nothing there".
 */

/** A claim whose judge call failed is held when a published claim scored at least this close. */
export const HOLD_BEST_SCORE = 0.95;

export type BlockTextMode = 'keep' | 'rewrite';

export type LateClaimStatement = {
  claimId: string;
  turnIndex: number;
  text: string;
  /** The claim entity is created by this edit (it is not on the graph as a Claim in this space). */
  minted: boolean;
  /** The claim is one geo-chat matched to an already published claim (`existing_entity_id`). */
  matched: boolean;
};

export type LateClaimSkipReason = 'block_missing' | 'no_stable_id';

export type LateClaimsPlan = {
  debateId: string;
  spaceId: string;
  statements: LateClaimStatement[];
  held: Array<{ claimId: string; text: string; bestScore: number }>;
  skipped: Array<{ claimId: string | null; turnIndex: number; text: string; reason: LateClaimSkipReason }>;
  /** Claims already linked from a block of this debate, which geo-chat now also places on turns that do not link them. */
  turnMoved: Array<{ claimId: string; text: string; linkedTurns: number[]; geoChatTurns: number[] }>;
  /** Whether the published transcript lines up with geo-chat's turns one for one. Checked only for `rewrite`. */
  structure: 'lines_up' | 'mismatch' | 'not_checked';
  structureProblems: string[];
  blockRewrites: Array<{ turnIndex: number; blockId: string; before: string; after: string }>;
  rewriteSkipped: Array<{ turnIndex: number; reason: 'edited_on_graph' | 'structure_mismatch' }>;
  /** Blocks whose published text differs from geo-chat's turn text (for `keep`, the drift left in place). */
  driftedTurns: number[];
  /** Hash of everything this edit would write. `apply` must present the dry run's value. */
  fingerprint: string;
  opCount: number;
};

export type PublishMissingDebateClaimsResult =
  | { status: 'published'; plan: LateClaimsPlan; userOpHash: string }
  | { status: 'dry_run'; plan: LateClaimsPlan }
  /** Nothing to write. Holds and skips may still be listed. */
  | { status: 'up_to_date'; plan: LateClaimsPlan }
  /** geo-chat or the graph changed since the dry run that `expect` came from. Nothing submitted. */
  | { status: 'changed_since_dry_run'; plan: LateClaimsPlan; expected: string }
  /** An edit for this debate went out within the lease and may not have indexed yet. */
  | { status: 'submission_pending' }
  /** The full publish has not run; it writes the claims itself. */
  | { status: 'debate_not_published' }
  | { status: 'no_claims' }
  | { status: 'dedup_pending' }
  | { status: 'not_editor'; spaceId: string }
  | { status: 'acceptor_not_configured' };

export type PublishMissingDebateClaimsOptions = {
  /** Default true: build and report, submit nothing. */
  dryRun?: boolean;
  /** Required to submit: the `fingerprint` of the dry run that was reviewed. */
  expect?: string;
  /** Default `keep`. */
  blockText?: BlockTextMode;
};

type AcceptorSpace = { id: string; type: string; address: string };

/** Published turn blocks of a debate, read back from the graph. */
export type PublishedBlocks = {
  /** Block id → its Markdown content in the space; a block with no Markdown value maps to null. Absent ids do not exist. */
  markdown: Map<string, string | null>;
  /** Targets of the Transcript's Blocks relations in the space, in no particular order, duplicates kept. */
  transcriptBlocks: string[];
  /** Block id → its Authors targets in the space. */
  authors: Map<string, string[]>;
  /** Block id → the claims it links through `Claims`, in the space. */
  claimLinks: Map<string, string[]>;
};

export type PublishMissingDebateClaimsDeps = {
  getConfig: () => DebateAcceptorConfig | null;
  debateEntityExists: (debateEntityId: string) => Promise<boolean>;
  loadDebate: (debateId: string) => Promise<Debate>;
  loadClaims: (debateId: string) => Promise<{
    transcriptTurns: DebatePublishTurn[];
    claims: DebateClaimInput[];
    dedupPendingUntil?: number | null;
  } | null>;
  loadServedTurns: (debateId: string, debate: Debate) => Promise<DebatePublishTurn[]>;
  loadEditableSpace: (spaceId: string, config: DebateAcceptorConfig, debateId: string) => Promise<AcceptorSpace | null>;
  applyReusePolicy: typeof applyClaimReusePolicy;
  applyStancePolicy: typeof applyClaimStancePolicy;
  lookupClaims: ExistingClaimLookup;
  readBlocks: (debateEntityId: string, blockIds: string[], spaceId: string) => Promise<PublishedBlocks>;
  prepareOps: (values: Value[], relations: Relation[], spaceId: string) => Promise<Op[]>;
  submit: typeof submitEditAsAcceptor;
  withLease: <T>(
    debateId: string,
    run: (markSubmitted: () => void) => Promise<T>
  ) => Promise<{ ran: true; value: T } | { ran: false }>;
  now: () => number;
};

/** The lease key: separate from the full publish's, which a published debate already spent. */
export function lateClaimsLeaseKey(debateId: string): string {
  return `debate-acceptor:late-claims-submitted:${debateId.replace(/-/g, '').toLowerCase()}`;
}

const defaultDeps: PublishMissingDebateClaimsDeps = {
  getConfig: getDebateAcceptorConfig,
  debateEntityExists: async id => (await Effect.runPromise(getEntity(id))) !== null,
  loadDebate: loadSettledDebate,
  loadClaims: debateId => loadDebateClaims(debateId, { strict: true }),
  loadServedTurns: loadServedTranscriptTurns,
  loadEditableSpace: loadAcceptorEditableSpace,
  applyReusePolicy: applyClaimReusePolicy,
  applyStancePolicy: applyClaimStancePolicy,
  lookupClaims: lookupExistingClaimsInGraph,
  readBlocks: readPublishedBlocks,
  prepareOps: (values, relations, spaceId) =>
    Effect.runPromise(Publish.prepareLocalDataForPublishing(values, relations, spaceId)),
  submit: submitEditAsAcceptor,
  withLease: (debateId, run) =>
    withDebatePublishLease(debateId, run, { store: upstashStore(lateClaimsLeaseKey(debateId)) }),
  now: Date.now,
};

export async function publishMissingDebateClaims(
  debateId: string,
  options: PublishMissingDebateClaimsOptions = {},
  deps: Partial<PublishMissingDebateClaimsDeps> = {}
): Promise<PublishMissingDebateClaimsResult> {
  const d = { ...defaultDeps, ...deps };
  const dryRun = options.dryRun ?? true;
  const blockText = options.blockText ?? 'keep';
  const config = d.getConfig();
  if (!config) return { status: 'acceptor_not_configured' };

  const debateEntityId = ID.uuidToHex(debateId);
  if (!(await d.debateEntityExists(debateEntityId))) return { status: 'debate_not_published' };

  // Complete, not cancelled, past the opt-out window — or this throws.
  const debate = await d.loadDebate(debateId);
  const spaceId = debate.claim.space_id;

  const extracted = await d.loadClaims(debateId);
  if (!extracted || extracted.claims.length === 0) return { status: 'no_claims' };
  if (!isDedupSettled(extracted.dedupPendingUntil, d.now())) return { status: 'dedup_pending' };

  const space = await d.loadEditableSpace(spaceId, config, debateId);
  if (!space) return { status: 'not_editor', spaceId };

  const build = async () => {
    const plan = await planLateClaims({ debateId, debateEntityId, debate, extracted, blockText }, d);
    return plan;
  };

  if (dryRun) {
    const { plan } = await build();
    return plan.opCount === 0 ? { status: 'up_to_date', plan } : { status: 'dry_run', plan };
  }

  const outcome = await d.withLease(debateId, async markSubmitted => {
    // Re-planned under the lease, so what is submitted is what the graph lacks right now.
    const { plan, values, relations } = await build();
    if (plan.opCount === 0) return { status: 'up_to_date', plan } as const;
    if (options.expect !== plan.fingerprint) {
      return { status: 'changed_since_dry_run', plan, expected: options.expect ?? '' } as const;
    }
    const ops = await d.prepareOps(values, relations, spaceId);
    if (ops.length === 0) throw new Error(`Late claims of debate ${debateId} resolved to an empty edit.`);
    const userOpHash = await d.submit(config, { name: editName(debate, plan), ops, space }, markSubmitted);
    console.log('[debate-acceptor] published late debate claims', {
      debateId,
      spaceId,
      statements: plan.statements.length,
      minted: plan.statements.filter(s => s.minted).length,
      blockRewrites: plan.blockRewrites.length,
      held: plan.held.length,
      skipped: plan.skipped.length,
      userOpHash,
    });
    return { status: 'published', plan, userOpHash } as const;
  });
  if (!outcome.ran) return { status: 'submission_pending' };
  return outcome.value;
}

type PlanInput = {
  debateId: string;
  debateEntityId: string;
  debate: Debate;
  extracted: { transcriptTurns: DebatePublishTurn[]; claims: DebateClaimInput[] };
  blockText: BlockTextMode;
};

async function planLateClaims(
  { debateId, debateEntityId, debate, extracted, blockText }: PlanInput,
  d: PublishMissingDebateClaimsDeps
): Promise<{ plan: LateClaimsPlan; values: Value[]; relations: Relation[] }> {
  const spaceId = debate.claim.space_id;
  const motionId = debate.claim.claim_entity_id;
  const key = (id: string) => uuidToHex(id);

  const turns = extracted.transcriptTurns.filter(turn => turn.text.trim().length > 0);
  const turnIndexes = new Set(turns.map(turn => turn.turnIndex));

  // Policies first, exactly as the full publish runs them, but strict: a failed read throws.
  const reused = await d.applyReusePolicy(extracted.claims, spaceId, {
    debateId,
    motionClaimEntityId: motionId,
    strict: true,
  });

  // What the graph already has for this debate.
  const blockIdByTurn = new Map(
    turns.map(turn => [turn.turnIndex, debateTurnBlockEntityId(debateEntityId, turn.turnIndex)])
  );
  const published = await d.readBlocks(debateEntityId, [...blockIdByTurn.values()], spaceId);
  const turnByBlock = new Map([...blockIdByTurn].map(([turn, block]) => [block, turn]));
  const linkedTurnsByClaim = new Map<string, number[]>();
  for (const [blockId, claimIds] of published.claimLinks) {
    const turn = turnByBlock.get(blockId);
    if (turn === undefined) continue;
    for (const claimId of claimIds) {
      const list = linkedTurnsByClaim.get(key(claimId)) ?? [];
      if (!list.includes(turn)) list.push(turn);
      linkedTurnsByClaim.set(key(claimId), list);
    }
  }

  const held: LateClaimsPlan['held'] = [];
  const skipped: LateClaimsPlan['skipped'] = [];
  const candidates: DebateClaimInput[] = [];
  for (const claim of reused) {
    if (claim.text.trim().length === 0 || !turnIndexes.has(claim.turnIndex)) continue; // the full publish drops these too
    const id = claim.existingClaimEntityId || claim.stableEntityId || null;
    if (!id) {
      skipped.push({ claimId: null, turnIndex: claim.turnIndex, text: claim.text, reason: 'no_stable_id' });
      continue;
    }
    // A claim the debate already links is published, whatever its match said; only new ones are held.
    if (
      !linkedTurnsByClaim.has(key(id)) &&
      !claim.existingClaimEntityId &&
      claim.matchVerdict === 'error' &&
      typeof claim.matchBestScore === 'number' &&
      claim.matchBestScore >= HOLD_BEST_SCORE
    ) {
      if (!held.some(h => h.claimId === key(id)))
        held.push({ claimId: key(id), text: claim.text, bestScore: claim.matchBestScore });
      continue;
    }
    candidates.push(claim);
  }
  const claims = await d.applyStancePolicy(candidates, spaceId, motionId, { debateId, strict: true });

  const claimId = (claim: DebateClaimInput) => key((claim.existingClaimEntityId || claim.stableEntityId) as string);
  const stableIds = [...new Set(claims.filter(c => !c.existingClaimEntityId).map(claimId))];
  const existing = stableIds.length > 0 ? await d.lookupClaims(stableIds, spaceId) : [];
  const spaceKey = key(spaceId);
  const existingClaims = new Set(
    existing
      .filter(
        entity =>
          entity.types.some(type => key(type.id) === key(CLAIM_TYPE_ID)) &&
          entity.spaces.some(space => key(space) === spaceKey)
      )
      .map(entity => key(entity.id))
  );

  // Statements: one per (turn, claim). A claim the debate links from any block is left alone.
  const statements: LateClaimStatement[] = [];
  const turnMoved = new Map<string, LateClaimsPlan['turnMoved'][number]>();
  const seen = new Set<string>();
  for (const claim of claims) {
    const id = claimId(claim);
    const statementKey = `${claim.turnIndex}:${id}`;
    if (seen.has(statementKey)) continue;
    seen.add(statementKey);
    const linked = linkedTurnsByClaim.get(id);
    if (linked) {
      if (!linked.includes(claim.turnIndex)) {
        const entry = turnMoved.get(id) ?? {
          claimId: id,
          text: claim.text,
          linkedTurns: [...linked].sort((a, b) => a - b),
          geoChatTurns: [],
        };
        if (!entry.geoChatTurns.includes(claim.turnIndex)) entry.geoChatTurns.push(claim.turnIndex);
        turnMoved.set(id, entry);
      }
      continue;
    }
    const blockId = blockIdByTurn.get(claim.turnIndex) as string;
    if (!published.markdown.has(blockId)) {
      skipped.push({ claimId: id, turnIndex: claim.turnIndex, text: claim.text, reason: 'block_missing' });
      continue;
    }
    statements.push({
      claimId: id,
      turnIndex: claim.turnIndex,
      text: claim.text,
      minted: !claim.existingClaimEntityId && !existingClaims.has(id),
      matched: Boolean(claim.existingClaimEntityId),
    });
  }

  // Block text: what drifted, and, for `rewrite`, what may be rewritten.
  const norm = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const driftedTurns = turns
    .filter(turn => {
      const blockId = blockIdByTurn.get(turn.turnIndex) as string;
      return published.markdown.has(blockId) && norm(published.markdown.get(blockId)) !== norm(turn.text);
    })
    .map(turn => turn.turnIndex);
  let structure: LateClaimsPlan['structure'] = 'not_checked';
  const structureProblems: string[] = [];
  const blockRewrites: LateClaimsPlan['blockRewrites'] = [];
  const rewriteSkipped: LateClaimsPlan['rewriteSkipped'] = [];
  if (blockText === 'rewrite' && driftedTurns.length > 0) {
    structureProblems.push(...checkStructure(turns, blockIdByTurn, published));
    structure = structureProblems.length === 0 ? 'lines_up' : 'mismatch';
    // The machine text a block was published with: geo-chat's served transcript, merged as the
    // full publish merges it. A block holding anything else was edited on the graph and is kept.
    const served = structure === 'lines_up' ? await d.loadServedTurns(debateId, debate) : [];
    const servedByTurn = new Map(served.map(turn => [turn.turnIndex, turn.text]));
    for (const turnIndex of driftedTurns) {
      if (structure !== 'lines_up') {
        rewriteSkipped.push({ turnIndex, reason: 'structure_mismatch' });
        continue;
      }
      const blockId = blockIdByTurn.get(turnIndex) as string;
      const before = published.markdown.get(blockId) ?? '';
      const machine = servedByTurn.get(turnIndex);
      if (machine === undefined || norm(machine) !== norm(before)) {
        rewriteSkipped.push({ turnIndex, reason: 'edited_on_graph' });
        continue;
      }
      const after = (turns.find(turn => turn.turnIndex === turnIndex) as DebatePublishTurn).text.trim();
      blockRewrites.push({ turnIndex, blockId, before, after });
    }
  }

  // The full draft for these claims, filtered to what this edit writes.
  const draft = buildDebatePublishDraft({
    debateId: debate.id,
    spaceId,
    claimEntityId: motionId,
    claimText: debate.claim.claim,
    subjectKind: 'claim',
    participants: debate.participants.map(p => ({
      spaceEntityId: p.profile_space_id,
      displayName: p.display_name,
      position: p.position,
      participantSlot: p.participant_slot,
    })),
    videoUrl: null,
    keyframeUrl: null,
    ogImageUrl: null,
    transcriptTurns: extracted.transcriptTurns,
    claims,
  });
  const { values, relations } = selectLateClaimOps(draft, {
    statements: statements.map(s => ({ blockId: blockIdByTurn.get(s.turnIndex) as string, claimId: s.claimId })),
    minted: new Set(statements.filter(s => s.minted).map(s => s.claimId)),
    matched: new Set(statements.filter(s => s.matched).map(s => s.claimId)),
    rewriteBlocks: new Set(blockRewrites.map(r => r.blockId)),
  });

  const plan: LateClaimsPlan = {
    debateId,
    spaceId,
    statements,
    held,
    skipped,
    turnMoved: [...turnMoved.values()].map(entry => ({
      ...entry,
      geoChatTurns: entry.geoChatTurns.sort((a, b) => a - b),
    })),
    structure,
    structureProblems,
    blockRewrites,
    rewriteSkipped,
    driftedTurns,
    fingerprint: fingerprintOf(statements, blockRewrites),
    opCount: values.length + relations.length,
  };
  return { plan, values, relations };
}

/**
 * Whether the published transcript is geo-chat's turns one for one: one Blocks relation per turn,
 * each to that turn's derived block, no other block, and each block authored by that turn's speaker
 * alone. Returns what does not line up; empty means it does.
 */
function checkStructure(
  turns: DebatePublishTurn[],
  blockIdByTurn: Map<number, string>,
  published: PublishedBlocks
): string[] {
  const problems: string[] = [];
  const expected = new Set([...blockIdByTurn.values()]);
  const listed = published.transcriptBlocks.map(id => uuidToHex(id));
  if (listed.length !== new Set(listed).size) problems.push('transcript lists a block twice');
  if (new Set(listed).size !== expected.size)
    problems.push(`transcript lists ${new Set(listed).size} blocks, geo-chat has ${expected.size} turns`);
  for (const id of listed)
    if (!expected.has(id)) problems.push(`transcript lists block ${id}, which is no geo-chat turn`);
  for (const turn of turns) {
    const blockId = blockIdByTurn.get(turn.turnIndex) as string;
    if (!published.markdown.has(blockId)) {
      problems.push(`turn ${turn.turnIndex} has no published block`);
      continue;
    }
    const authors = (published.authors.get(blockId) ?? []).map(id => uuidToHex(id));
    if (authors.length !== 1 || authors[0] !== uuidToHex(turn.speakerSpaceEntityId)) {
      problems.push(`turn ${turn.turnIndex} block is not authored by that turn's speaker alone`);
    }
  }
  return problems;
}

export type LateClaimSelection = {
  /** (block, claim) pairs whose `Claims` relation is written, with its offsets, scores and Selector. */
  statements: Array<{ blockId: string; claimId: string }>;
  /** Claims created by this edit: they also get Name, Types, Is factual and Topics. */
  minted: Set<string>;
  /** Claims geo-chat matched to a published claim: they also get the Topics the reuse policy left. */
  matched: Set<string>;
  /** Blocks whose Markdown content is rewritten. */
  rewriteBlocks: Set<string>;
};

const STANCE_PROPERTY_KEYS = new Set(Object.values(CLAIM_STANCE_PROPERTY_IDS).map(id => uuidToHex(id)));

/**
 * The part of a full debate draft that describes the selected statements and claims. Pure.
 *
 * Kept: each selected block → claim `Claims` relation and everything on its relation entity
 * (offsets, scores, Types → Selector, Target); for every claim with a selected statement, its
 * Sources → Debate and its stance relation (the stance policy already cleared any the graph has);
 * for minted claims, their Name, Is factual, Types and Topics; for matched claims, their Topics
 * (the reuse policy subtracted the ones the entity carries); for rewritten blocks, their Markdown
 * content. Everything else — the Debate, its Transcript, Video, share card, participants, the
 * blocks' other values and relations, another statement's ops — is dropped.
 */
export function selectLateClaimOps(
  draft: Pick<DebatePublishDraft, 'debateEntityId' | 'values' | 'relations'>,
  selection: LateClaimSelection
): { values: Value[]; relations: Relation[] } {
  const k = (id: string) => uuidToHex(id);
  const statementKeys = new Set(selection.statements.map(s => `${k(s.blockId)}:${k(s.claimId)}`));
  const claims = new Set(selection.statements.map(s => k(s.claimId)));
  const minted = new Set([...selection.minted].map(k));
  const matched = new Set([...selection.matched].map(k));
  const rewriteBlocks = new Set([...selection.rewriteBlocks].map(k));
  const debateKey = k(draft.debateEntityId);

  const statementEntities = new Set<string>();
  const relations: Relation[] = [];
  for (const relation of draft.relations) {
    const type = k(relation.type.id);
    const from = k(relation.fromEntity.id);
    const to = k(relation.toEntity.id);
    if (type === k(DEBATE_CLAIMS_PROPERTY_ID) && statementKeys.has(`${from}:${to}`)) {
      statementEntities.add(k(relation.entityId));
      relations.push(relation);
    }
  }
  for (const relation of draft.relations) {
    const type = k(relation.type.id);
    const from = k(relation.fromEntity.id);
    const to = k(relation.toEntity.id);
    if (statementEntities.has(from)) {
      relations.push(relation);
      continue;
    }
    if (!claims.has(from)) continue;
    if (type === k(SOURCES_PROPERTY_ID) && to === debateKey) relations.push(relation);
    else if (STANCE_PROPERTY_KEYS.has(type)) relations.push(relation);
    else if (type === k(TYPES_PROPERTY_ID) && minted.has(from)) relations.push(relation);
    else if (type === k(TOPICS_PROPERTY_ID) && (minted.has(from) || matched.has(from))) relations.push(relation);
  }

  const values = draft.values.filter(value => {
    const entity = k(value.entity.id);
    if (statementEntities.has(entity)) return true;
    if (minted.has(entity)) return true;
    return rewriteBlocks.has(entity) && k(value.property.id) === k(MARKDOWN_CONTENT_PROPERTY_ID);
  });
  return { values, relations };
}

function fingerprintOf(statements: LateClaimStatement[], rewrites: LateClaimsPlan['blockRewrites']): string {
  const sha = (text: string) => createHash('sha256').update(text).digest('hex');
  const body = JSON.stringify({
    statements: statements.map(s => `${s.turnIndex}:${s.claimId}:${s.minted ? 'minted' : 'linked'}`).sort(),
    rewrites: rewrites.map(r => `${r.turnIndex}:${sha(r.before)}:${sha(r.after)}`).sort(),
  });
  return sha(body).slice(0, 16);
}

function editName(debate: Debate, plan: LateClaimsPlan): string {
  const count = plan.statements.length;
  const noun = count === 1 ? 'claim' : 'claims';
  return `${count} ${noun} added to the debate on "${debate.claim.claim.trim()}"`;
}

const BLOCK_MARKDOWN_SOURCE = /* GraphQL */ `
  query DebateBlockMarkdown($ids: [UUID!]!, $propertyId: UUID!, $spaceId: UUID!, $first: Int!) {
    values(
      first: $first
      filter: { entityId: { in: $ids }, propertyId: { is: $propertyId }, spaceId: { is: $spaceId } }
    ) {
      entityId
      text
    }
    entities(first: $first, filter: { id: { in: $ids } }) {
      id
      spaceIds
    }
  }
`;

type BlockMarkdownQuery = {
  values: Array<{ entityId: string | null; text: string | null } | null> | null;
  entities: Array<{ id: string; spaceIds: Array<string | null> | null } | null> | null;
};

const blockMarkdownDocument = parse(BLOCK_MARKDOWN_SOURCE) as TypedDocumentNode<
  BlockMarkdownQuery,
  { ids: string[]; propertyId: string; spaceId: string; first: number }
>;

/** Bounded: a debate has a dozen turns or so. A full page is refused rather than trusted. */
const MAX_BLOCKS = 200;

/**
 * The debate's published turn blocks, read back from the graph in the publication space. Throws
 * on any failed read: a missing answer must not read as "no block" or "no link".
 */
export async function readPublishedBlocks(
  debateEntityId: string,
  blockIds: string[],
  spaceId: string
): Promise<PublishedBlocks> {
  if (blockIds.length > MAX_BLOCKS)
    throw new Error(`Debate ${debateEntityId} has more turns than the block read allows.`);
  const ids = blockIds.map(id => uuidToHex(id));
  const transcriptId = debateTranscriptEntityId(debateEntityId);
  const [data, links] = await Promise.all([
    blockIds.length === 0
      ? Promise.resolve<BlockMarkdownQuery>({ values: [], entities: [] })
      : Effect.runPromise(
          graphql({
            query: blockMarkdownDocument,
            decoder: response => response,
            variables: { ids, propertyId: MARKDOWN_CONTENT_PROPERTY_ID, spaceId, first: MAX_BLOCKS },
          })
        ),
    collectRelationTargets({
      fromEntityIds: [...ids, transcriptId],
      typeIds: [DEBATE_CLAIMS_PROPERTY_ID, AUTHORS_PROPERTY_ID, BLOCKS_PROPERTY_ID],
      spaceId,
    }),
  ]);
  return publishedBlocksFrom(ids, transcriptId, spaceId, data, links);
}

export function publishedBlocksFrom(
  blockIds: string[],
  transcriptId: string,
  spaceId: string,
  data: BlockMarkdownQuery,
  links: RelationTarget[]
): PublishedBlocks {
  const k = (id: string) => uuidToHex(id);
  const spaceKey = k(spaceId);
  const markdown = new Map<string, string | null>();
  for (const entity of data.entities ?? []) {
    if (!entity) continue;
    if (!(entity.spaceIds ?? []).some(space => space && k(space) === spaceKey)) continue;
    markdown.set(k(entity.id), null);
  }
  for (const value of data.values ?? []) {
    if (!value?.entityId) continue;
    const id = k(value.entityId);
    if (markdown.has(id)) markdown.set(id, value.text ?? '');
  }
  const wanted = new Set(blockIds.map(k));
  const transcriptBlocks: string[] = [];
  const authors = new Map<string, string[]>();
  const claimLinks = new Map<string, string[]>();
  for (const link of links) {
    const from = k(link.fromEntityId);
    const type = k(link.typeId);
    if (from === k(transcriptId) && type === k(BLOCKS_PROPERTY_ID)) transcriptBlocks.push(k(link.toEntityId));
    else if (wanted.has(from) && type === k(AUTHORS_PROPERTY_ID))
      authors.set(from, [...(authors.get(from) ?? []), k(link.toEntityId)]);
    else if (wanted.has(from) && type === k(DEBATE_CLAIMS_PROPERTY_ID))
      claimLinks.set(from, [...(claimLinks.get(from) ?? []), k(link.toEntityId)]);
  }
  return { markdown, transcriptBlocks, authors, claimLinks };
}
