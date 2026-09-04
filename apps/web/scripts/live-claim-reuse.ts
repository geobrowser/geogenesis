/**
 * Live harness for the find-or-create publisher half, runnable without a geo-chat deployment.
 *
 * Feeds a real `{ turns, claims }` payload — as produced by geo-chat's `live_matching` harness
 * (`cargo test -p geo-media live_matching -- --ignored --nocapture`, the `LIVE_PAYLOAD` line) —
 * through the same steps the publish sweep runs: decode, the reuse policy with a REAL graph read,
 * the draft builder and the op pipeline. Prints what would be reused and the ops that would be
 * published. Submits nothing.
 *
 *   NEXT_PUBLIC_CHAIN_ID=55516 NEXT_PUBLIC_PRIVY_APP_ID=live NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=live \
 *   DEBATE_CLAIM_REUSE_ENABLED=true \
 *   bun run scripts/live-claim-reuse.ts <payload.json> <debate space id>
 */
import { Effect } from 'effect';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID } from '~/core/claims/ontology';
import {
  type DebateClaimInput,
  type DebatePublishInput,
  buildDebatePublishDraft,
} from '~/core/debates/debate-publish-draft';
import { NAME_PROPERTY_ID, SOURCES_PROPERTY_ID, TYPES_PROPERTY_ID } from '~/core/debates/ontology';
import { applyClaimReusePolicy } from '~/core/debates/server/claim-reuse';
import { Publish } from '~/core/utils/publish';

type Payload = {
  turns: Array<{ turn_index: number; attributed_space_id: string; speaker_name: string | null; text: string }>;
  claims: Array<{
    text: string;
    is_factual: boolean | null;
    turn_index: number;
    existing_entity_id?: string | null;
    match?: { verdict?: string; best_score?: number | null; candidates?: number } | null;
  }>;
};

const [payloadPath, spaceId] = process.argv.slice(2);
if (!payloadPath || !spaceId) {
  console.error('usage: bun run scripts/live-claim-reuse.ts <payload.json> <debate space id>');
  process.exit(2);
}
const payload = JSON.parse(await Bun.file(payloadPath).text()) as Payload;

// Same decode as `loadDebateClaims` in debate-source.ts (private there, and it needs geo-chat).
const claims: DebateClaimInput[] = payload.claims.map(claim => ({
  text: claim.text,
  isFactual: claim.is_factual ?? null,
  turnIndex: claim.turn_index,
  existingClaimEntityId:
    typeof claim.existing_entity_id === 'string' && claim.existing_entity_id.trim().length > 0
      ? claim.existing_entity_id.trim()
      : null,
}));

console.log(`policy: DEBATE_CLAIM_REUSE_ENABLED=${process.env.DEBATE_CLAIM_REUSE_ENABLED ?? '(unset)'}`);
const decided = await applyClaimReusePolicy(claims, spaceId, { debateId: 'live-harness' });

// Stand-in speakers with well-formed ids; the harness turn carries a placeholder space id.
const YES = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NO = 'cccccccccccccccccccccccccccccccc';
const input: DebatePublishInput = {
  debateId: '11112222-3333-4444-5555-666677778888',
  spaceId,
  claimEntityId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  claimText: 'Live harness motion',
  participants: [
    { spaceEntityId: YES, displayName: 'Yes speaker', position: true, participantSlot: 1 },
    { spaceEntityId: NO, displayName: 'No speaker', position: false, participantSlot: 2 },
  ],
  videoUrl: null,
  keyframeUrl: null,
  ogImageUrl: null,
  transcriptTurns: payload.turns.map(turn => ({
    turnIndex: turn.turn_index,
    speakerSpaceEntityId: turn.turn_index % 2 === 0 ? YES : NO,
    speakerName: turn.speaker_name,
    text: turn.text,
  })),
  claims: decided,
};

const draft = buildDebatePublishDraft(input);
const ops = await Effect.runPromise(Publish.prepareLocalDataForPublishing(draft.values, draft.relations, spaceId));

console.log('\nclaims:');
for (const [index, claim] of decided.entries()) {
  const fromGeoChat = claims[index].existingClaimEntityId;
  const verdict = payload.claims[index].match?.verdict ?? '-';
  const outcome = claim.existingClaimEntityId
    ? `REUSE ${claim.existingClaimEntityId}`
    : fromGeoChat
      ? `MINT (reference ${fromGeoChat} dropped by policy)`
      : 'MINT';
  console.log(`  ${outcome.padEnd(52)} geo-chat: ${verdict.padEnd(14)} | ${claim.text}`);
}

const reusedIds = new Set(decided.map(claim => claim.existingClaimEntityId).filter((id): id is string => !!id));
const valuesOnReused = draft.values.filter(value => reusedIds.has(value.entity.id));
const typesOnReused = draft.relations.filter(r => reusedIds.has(r.fromEntity.id) && r.type.id === TYPES_PROPERTY_ID);
const sourcesFromReused = draft.relations.filter(
  r => reusedIds.has(r.fromEntity.id) && r.type.id === SOURCES_PROPERTY_ID
);
const claimsToReused = draft.relations.filter(r => reusedIds.has(r.toEntity.id) && r.type.id !== TYPES_PROPERTY_ID);
const mintedClaims = draft.relations.filter(r => r.type.id === TYPES_PROPERTY_ID && r.toEntity.id === CLAIM_TYPE_ID);
const opsByType = ops.reduce<Record<string, number>>((acc, op) => ({ ...acc, [op.type]: (acc[op.type] ?? 0) + 1 }), {});

console.log('\ndraft:');
console.log(`  minted Claim entities:                 ${mintedClaims.length}`);
console.log(`  reused Claim entities:                 ${reusedIds.size}`);
console.log(`  values written on reused entities:     ${valuesOnReused.length}  (must be 0)`);
console.log(`  Types relations from reused entities:  ${typesOnReused.length}  (must be 0)`);
console.log(`  block→Claims relations to reused:      ${claimsToReused.length}`);
console.log(`  claim→Sources relations from reused:   ${sourcesFromReused.length}`);
console.log(
  `  Name values written:                   ${draft.values.filter(v => v.property.id === NAME_PROPERTY_ID).length}`
);
console.log(
  `  Is factual values written:             ${draft.values.filter(v => v.property.id === CLAIM_IS_FACTUAL_PROPERTY_ID).length}`
);
console.log(`  ops by type:                           ${JSON.stringify(opsByType)}`);
console.log('\nnothing was submitted.');

if (valuesOnReused.length > 0 || typesOnReused.length > 0) {
  console.error('FAIL: the draft wrote onto a reused entity');
  process.exit(1);
}
