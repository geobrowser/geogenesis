/**
 * End-to-end check of the claim timing resolver against the live testnet debate.
 *
 * Runs the real grouping, the real resolver and the real ticker selection over the real published
 * data, so the answer is what the UI will draw rather than what a fixture says.
 *
 * Usage: bun scripts/verify-claim-timing.ts
 */
import { activeTickerClaim, claimMarkers, tickerWindows } from '../core/debates/claim-ticker';
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
const DEBATE_ENTITY = '01a0a60772dc7cb09bf6ebba15e97b67';
const DEBATE_ID = '01a0a607-72dc-7cb0-9bf6-ebba15e97b67';
const SPACE = '4582fbbee28a16589154f7e36f1ee3c5';

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
  console.log(`  ${at.padStart(5)}  [${source.padEnd(9)}]  ${claim.text.slice(0, 66)}`);
}

const windows = tickerWindows(ordered);
console.log(`\nticker-eligible claims: ${windows.length} of ${ordered.length}`);

const markers = claimMarkers(ordered, 270_000);
console.log(`scrubber markers: ${markers.length}`);

console.log('\nWhat the viewer sees, sampled every 10s:');
for (let ms = 0; ms <= 270_000; ms += 10_000) {
  const active = activeTickerClaim(windows, ms);
  if (active) console.log(`  ${formatTimecode(ms).padStart(5)}  ${active.claim.text.slice(0, 62)}`);
}

const missing = ordered.filter(claim => claim.timing === null);
console.log(`\nclaims with no moment at all: ${missing.length}`);
