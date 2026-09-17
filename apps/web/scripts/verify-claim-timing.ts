/**
 * End-to-end check of the claim timing resolver against the live testnet debate.
 *
 * Runs the real grouping, the real resolver and the real ticker selection over the real published
 * data, so the answer is what the UI will draw rather than what a fixture says.
 *
 * Usage: bun scripts/verify-claim-timing.ts [debateEntityId] [spaceId]
 */
import { claimMarkers, tickerStack, tickerWindows } from '../core/debates/claim-ticker';
import { claimsInSpokenOrder, formatTimecode, resolveClaimTimings } from '../core/debates/claim-timing';
import {
  AUTHORS_PROPERTY_ID,
  BLOCKS_PROPERTY_ID,
  CLAIM_END_OFFSET_PROPERTY_ID,
  CLAIM_START_OFFSET_PROPERTY_ID,
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_TRANSCRIPTS_PROPERTY_ID,
  MARKDOWN_CONTENT_PROPERTY_ID,
  NAME_PROPERTY_ID,
} from '../core/debates/ontology';
import { groupTranscriptClaims } from '../core/debates/transcript-claims';

const API = 'https://api-testnet.geobrowser.io/graphql';
const CHAT = 'https://chat-api-testnet.geobrowser.io';
// Any debate, so the resolver can be checked where offsets were *not* published as well as where
// they were — the fallback path is the one that runs on every debate but the test one.
const DEBATE_ENTITY = (process.argv[2] ?? '01a0a60772dc7cb09bf6ebba15e97b67').replaceAll('-', '');
const DEBATE_ID = DEBATE_ENTITY.replace(
  /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
  '$1-$2-$3-$4-$5'
);
const SPACE = process.argv[3] ?? '4582fbbee28a16589154f7e36f1ee3c5';

const QUERY = `
query DebateTranscriptClaims(
  $id: UUID!, $transcriptsPropertyId: UUID!, $blocksPropertyId: UUID!, $authorsPropertyId: UUID!,
  $claimsPropertyId: UUID!, $spaceId: UUID!, $namePropertyId: UUID!, $markdownPropertyId: UUID!,
  $offsetPropertyIds: [UUID!]
) {
  entity(id: $id) {
    transcripts: relationsList(filter: { typeId: { is: $transcriptsPropertyId }, spaceId: { is: $spaceId } }) {
      position
      toEntity {
        id
        blocks: relationsList(filter: { typeId: { is: $blocksPropertyId }, spaceId: { is: $spaceId } }) {
          position
          toEntity {
            id
            markdown: valuesList(filter: { propertyId: { is: $markdownPropertyId } }) { spaceId text }
            authors: relationsList(filter: { typeId: { is: $authorsPropertyId }, spaceId: { is: $spaceId } }) {
              toEntity { id }
            }
            claims: relationsList(filter: { typeId: { is: $claimsPropertyId }, spaceId: { is: $spaceId } }) {
              position
              entity {
                valuesList(filter: { propertyId: { in: $offsetPropertyIds }, spaceId: { is: $spaceId } }) {
                  propertyId
                  integer
                }
              }
              toEntity {
                id
                name
                spaceIds
                names: valuesList(filter: { propertyId: { is: $namePropertyId } }) { spaceId text }
              }
            }
          }
        }
      }
    }
  }
}`;

const response = await fetch(API, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: QUERY,
    variables: {
      id: DEBATE_ENTITY,
      transcriptsPropertyId: DEBATE_TRANSCRIPTS_PROPERTY_ID,
      blocksPropertyId: BLOCKS_PROPERTY_ID,
      authorsPropertyId: AUTHORS_PROPERTY_ID,
      claimsPropertyId: DEBATE_CLAIMS_PROPERTY_ID,
      spaceId: SPACE,
      namePropertyId: NAME_PROPERTY_ID,
      markdownPropertyId: MARKDOWN_CONTENT_PROPERTY_ID,
      offsetPropertyIds: [CLAIM_START_OFFSET_PROPERTY_ID, CLAIM_END_OFFSET_PROPERTY_ID],
    },
  }),
});

const body = await response.json();
if (body.errors) {
  console.error(JSON.stringify(body.errors, null, 2));
  process.exit(1);
}

const claims = groupTranscriptClaims(body.data, SPACE);
console.log(`claims: ${claims.totalCount}   blocks: ${claims.blocks.length}`);
console.log(`with published timecodes: ${claims.all.filter(claim => claim.publishedTiming !== null).length}`);

const transcript = await fetch(`${CHAT}/debates/${DEBATE_ID}/transcript?format=json`).then(value => value.json());
console.log(`transcript segments: ${transcript.segments.length}`);

const timings = resolveClaimTimings({ claims: claims.all, blocks: claims.blocks, segments: transcript.segments });
const ordered = claimsInSpokenOrder(claims.all, timings);

console.log('\nAs the UI will order and label them:');
for (const claim of ordered) {
  const timing = claim.timing;
  const at = timing ? formatTimecode(timing.startMs) : ' — ';
  const source = timing ? timing.source : 'none';
  const score = timing ? timing.confidence.toFixed(2) : ' -- ';
  console.log(`  ${at.padStart(5)}  [${source.padEnd(9)} ${score}]  ${claim.text.slice(0, 60)}`);
}

// The two gates, spelled out. A claim with no published offsets can still clear both on the
// strength of its transcript match alone — which is the fallback working, and also the thing worth
// knowing about, since neither surface distinguishes an inferred moment from a published one.
const bySource = new Map<string, number>();
for (const claim of ordered) bySource.set(claim.timing?.source ?? 'none', (bySource.get(claim.timing?.source ?? 'none') ?? 0) + 1);
console.log(`\nby source: ${[...bySource].map(([key, count]) => `${key}=${count}`).join('  ')}`);
console.log(
  `shown as "Said at" (source != block): ${ordered.filter(c => c.timing && c.timing.source !== 'block').length}`
);

const windows = tickerWindows(ordered);
console.log(`\nticker-eligible claims: ${windows.length} of ${ordered.length}`);

const markers = claimMarkers(ordered, 270_000);
console.log(`scrubber markers: ${markers.length}`);

console.log('\nWhat the viewer sees, sampled every 10s:');
for (let ms = 0; ms <= 270_000; ms += 10_000) {
  const stack = tickerStack(windows, ms);
  for (const card of stack) {
    console.log(
      `  ${formatTimecode(ms).padStart(5)}  [${card.opacity.toFixed(2)}]  ${card.window.claim.text.slice(0, 56)}`
    );
  }
}

const missing = ordered.filter(claim => claim.timing === null);
console.log(`\nclaims with no moment at all: ${missing.length}`);
