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

/**
 * The debate's Whisper transcript, or none where geo-chat genuinely has none.
 *
 * "None" means a 404 and nothing else. Every other failure throws.
 *
 * This used to swallow the lot — a 500, a dropped connection, a body that would not parse — and
 * hand back an empty transcript, which is indistinguishable from a debate that was never recorded.
 * Downstream that is not a small lie: the planner counts every claim of that debate as unmatched
 * and writes a plan that looks complete, the export drops the debate from its task files, and the
 * verifier prints "no transcript" and exits 0. An outage halfway through a run would have produced
 * a confident, quietly partial answer — the one outcome these scripts exist to avoid.
 */
export async function fetchTranscriptSegments(debateEntityId: string): Promise<DebateTranscriptSegment[]> {
  const url = `${CHAT}/debates/${toDashedUuid(debateEntityId)}/transcript?format=json`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new Error(`transcript request failed for ${debateEntityId}: ${(cause as Error).message}`, { cause });
  }

  // The recording is not served, which is a real answer about this debate rather than a failure.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`transcript for ${debateEntityId} returned ${response.status}`);

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new Error(`transcript for ${debateEntityId} was not valid JSON`, { cause });
  }

  // A 200 whose body is not a transcript is not an empty transcript. `?.segments ?? []` said it
  // was, so an error payload or a schema change came back as "this debate was never recorded" —
  // the same lie as the swallowed 500 above, arriving through the one door left open.
  const segments = (body as { segments?: unknown } | null)?.segments;
  if (!Array.isArray(segments)) {
    throw new Error(`transcript for ${debateEntityId} came back without a segments array`);
  }
  return segments as DebateTranscriptSegment[];
}

/**
 * Reads `--name value` off the command line.
 *
 * Three scripts here take flags and each had written this out again. It is four lines, which is
 * exactly the size of thing that gets copied until one copy quietly disagrees with the others.
 */
export function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;

  // A flag that is present but has no value is a mistake, not an absence. Returning `undefined`
  // sent it to the fallback, so a trailing `--limit` quietly meant "every debate" and
  // `--out --limit 5` took "--limit" for the output directory — both the same shape as the
  // `NaN` floor {@link numberArg} was written for, and both on scripts that plan writes.
  // Blank counts as missing, not as a value. `--floor "$FLOOR"` with `FLOOR` unset expands to an
  // empty argument, which looks present to `indexOf` and coerces to 0 in {@link numberArg} — the
  // floor disabled by a shell variable nobody set.
  const value = process.argv[index + 1];
  if (value === undefined || value.trim() === '' || value.startsWith('--')) {
    console.error(`--${name} needs a value${value === undefined ? '' : `; got "${value}"`}`);
    process.exit(1);
  }
  return value;
}

/**
 * Reads a number off the command line, refusing anything that is not one.
 *
 * `Number(arg('floor'))` on a typo gives `NaN`, and every comparison against `NaN` is false — so a
 * mistyped `--floor` did not fail, it silently *disabled* the confidence floor and planned a write
 * for every match the matcher produced. The same shape sat behind `--limit`, where it quietly meant
 * "no limit" and would have walked all 80 debates.
 *
 * A bad flag stops the script instead. These write publish plans; a silent misreading of the one
 * number that bounds them is the worst available outcome.
 */
export function numberArg(
  name: string,
  { fallback, min = -Infinity, max = Infinity }: { fallback: number; min?: number; max?: number }
): number {
  const raw = arg(name);
  if (raw === undefined) return fallback;

  // `Number('')` and `Number('   ')` are both 0, which every range here admits. Checked again
  // rather than left to `arg`, because this is the guard the floor's safety rests on and it is
  // exported on its own.
  const value = raw.trim() === '' ? Number.NaN : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    console.error(`--${name} must be a number between ${min} and ${max}; got "${raw}"`);
    process.exit(1);
  }
  return value;
}

/**
 * The same guard for a positional argument, which cannot name itself in the error.
 */
export function numberAt(index: number, label: string, fallback: number, min = 0): number {
  const raw = process.argv[index];
  if (raw === undefined) return fallback;

  // As in {@link numberArg}: blank coerces to 0 rather than failing. This one reads `process.argv`
  // directly, so it cannot lean on `arg`.
  const value = raw.trim() === '' ? Number.NaN : Number(raw);
  if (!Number.isFinite(value) || value < min) {
    console.error(`${label} must be a number of at least ${min}; got "${raw}"`);
    process.exit(1);
  }
  return value;
}
