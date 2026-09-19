/**
 * Reading a debate's claims and transcript from testnet, for the scripts that work on timecodes.
 *
 * Both `verify-claim-timing.ts` and `plan-claim-timecodes.ts` need exactly this, and each had its
 * own copy of the traversal — the same forty lines of GraphQL the app already carries in
 * `core/io/debate-transcript-claims-document.ts`, so three copies of one query. The app's document
 * is the source here, which also means a field added for the UI cannot silently stop being read by
 * the tooling that checks it.
 *
 * Deliberately raw `fetch` rather than `core/io/queries.ts`: that path goes through the Effect
 * client and the app's runtime config, which a bun script has no business standing up. The query
 * text is what matters, and that is shared.
 */
import { print } from 'graphql';

import type { DebateTranscriptSegment } from '../../core/debates/api';
import {
  AUTHORS_PROPERTY_ID,
  BLOCKS_PROPERTY_ID,
  CLAIM_END_OFFSET_PROPERTY_ID,
  CLAIM_START_OFFSET_PROPERTY_ID,
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_TRANSCRIPTS_PROPERTY_ID,
  DEBATE_TYPE_ID,
  MARKDOWN_CONTENT_PROPERTY_ID,
  NAME_PROPERTY_ID,
} from '../../core/debates/ontology';
import { type DebateTranscriptClaims, groupTranscriptClaims } from '../../core/debates/transcript-claims';
import {
  type DebateTranscriptClaimsQuery,
  debateTranscriptClaimsDocument,
} from '../../core/io/debate-transcript-claims-document';

export const API = 'https://api-testnet.geobrowser.io/graphql';
const CHAT = 'https://chat-api-testnet.geobrowser.io';

/** `4c81561d1f95…` → `4c81561d-1f95-…`. The chat API wants the dashed form; the graph does not. */
function toDashedUuid(id: string): string {
  return id.replaceAll('-', '').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

export async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data as T;
}

const ALL_DEBATES = /* GraphQL */ `
  query AllDebates($typeId: UUID!, $first: Int) {
    entities(typeId: $typeId, first: $first) {
      id
      name
      spaceIds
    }
  }
`;

/**
 * Every `Debate`-typed entity, with the spaces it appears in.
 *
 * `typeId` is a field argument on `entities`, not a field of `EntityFilter` — the filter's own
 * `typeIds` returns an internal error. Same shape as `votedBy`.
 */
export async function fetchAllDebates(): Promise<{ id: string; name: string | null; spaceIds: string[] }[]> {
  const data = await graphql<{ entities: { id: string; name: string | null; spaceIds: string[] }[] }>(ALL_DEBATES, {
    typeId: DEBATE_TYPE_ID,
    first: 1000,
  });
  return data.entities;
}

/** One debate's claims and turns, grouped exactly as the app groups them. */
export async function fetchDebateClaims(debateEntityId: string, spaceId: string): Promise<DebateTranscriptClaims> {
  const data = await graphql<DebateTranscriptClaimsQuery>(print(debateTranscriptClaimsDocument), {
    id: debateEntityId,
    transcriptsPropertyId: DEBATE_TRANSCRIPTS_PROPERTY_ID,
    blocksPropertyId: BLOCKS_PROPERTY_ID,
    authorsPropertyId: AUTHORS_PROPERTY_ID,
    claimsPropertyId: DEBATE_CLAIMS_PROPERTY_ID,
    spaceId,
    namePropertyId: NAME_PROPERTY_ID,
    markdownPropertyId: MARKDOWN_CONTENT_PROPERTY_ID,
    offsetPropertyIds: [CLAIM_START_OFFSET_PROPERTY_ID, CLAIM_END_OFFSET_PROPERTY_ID],
  });

  return groupTranscriptClaims(data, spaceId);
}

/** The debate's Whisper transcript, or none where geo-chat no longer serves it. */
export async function fetchTranscriptSegments(debateEntityId: string): Promise<DebateTranscriptSegment[]> {
  try {
    const response = await fetch(`${CHAT}/debates/${toDashedUuid(debateEntityId)}/transcript?format=json`);
    if (!response.ok) return [];
    return (await response.json())?.segments ?? [];
  } catch {
    // A debate whose recording geo-chat no longer serves simply gets no matches.
    return [];
  }
}

/**
 * Reads `--name value` off the command line.
 *
 * Three scripts here take flags and each had written this out again. It is four lines, which is
 * exactly the size of thing that gets copied until one copy quietly disagrees with the others.
 */
export function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
