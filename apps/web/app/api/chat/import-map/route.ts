// POST /api/chat/import-map — sub-agent that maps an uploaded file's columns
// onto a space's existing ontology.
//
// A sub-agent for the same reasons as geo-query: the instructions are long, the
// work is a search-and-decide loop the main executor has no steps to spare for,
// and the answer is structured rather than prose. The main turn gets a finished
// mapping and never sees the candidate lists.
import { createAnthropic } from '@ai-sdk/anthropic';
import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { generateText, jsonSchema, stepCountIs, tool } from 'ai';
import * as Effect from 'effect/Effect';
import { cookies } from 'next/headers';

import { coerce, isCoercionRule, isPlaceholder } from '~/core/chat/import/coerce';
import type { ImportMapInput, ImportMapping, MappedColumn, MappingColumnInput } from '~/core/chat/import/mapping-types';
import { isRelationSplitRule } from '~/core/chat/import/mapping-types';
import { ROOT_SPACE } from '~/core/constants';
import { WALLET_ADDRESS } from '~/core/cookie';
import { getAllEntities, getProperties, getResults } from '~/core/io/queries';
import type { Property } from '~/core/types';
import { RANKED_SPACE_IDS, getSpaceRank } from '~/core/utils/space/space-ranking';

import { hydrateRelationValueTypes } from '~/partials/import/import-generation';

import { logCallCost } from '../cost';
import { RESEARCH_MODEL } from '../models';
import { ipCeilingLimit, loggedInLimit } from '../rate-limit';
import {
  LIST_TYPES_SCHEMA,
  type ListTypesInput,
  RECONSIDER_COLUMNS_SCHEMA,
  type ReconsiderColumnsInput,
  SEARCH_PROPERTIES_SCHEMA,
  SUBMIT_MAPPING_SCHEMA,
  type SearchPropertiesInput,
  type SubmitMappingInput,
  type SubmittedColumn,
} from './schema';
import { IMPORT_MAP_SYSTEM_PROMPT } from './system-prompt';

const anthropic = createAnthropic({ apiKey: process.env.CLAUDE_API_KEY });

/**
 * Above `TOTAL_BUDGET_MS`, so a slow mapping ends as our own 504 with a message
 * the dispatcher understands rather than a platform kill mid-response. The
 * default is 60s, which this route can legitimately exceed on a wide file.
 */
export const maxDuration = 120;

const MAX_COLUMNS = 60;
const MAX_SAMPLES_PER_COLUMN = 5;
const MAX_SAMPLE_CHARS = 120;
/** Matches the cap the dispatcher already applies before sending. */
const MAX_HINT_CHARS = 400;
/** Matches `MAX_SEARCH_ADDITIONAL_SPACE_IDS`, the cap the app's own search uses. */
const MAX_SEARCH_SPACES = 100;
/** Per space, not per request — the current space and root are fetched separately. */
const MAX_TYPES_PER_SPACE = 60;
/** Per `listTypes` search, per space. A name search needing more than this is too vague to act on. */
const MAX_TYPE_MATCHES = 10;
/** Per search term. Enough to choose between namesakes without flooding context. */
const MAX_RESULTS_PER_QUERY = 6;
/** listTypes → searchProperties (×2 at most) → submitMapping → reconsiderColumns, with room to recover. */
const MAX_TOOL_STEPS = 10;
/**
 * How many times a submission's skips may be sent back.
 *
 * One. The point is to catch a column skipped without engaging with the
 * candidates, and a model that has been shown them and still declines has given
 * its answer. Looping further would spend the budget arguing.
 */
const MAX_CONTEST_ROUNDS = 1;
const MAX_OUTPUT_TOKENS = 4_000;
/**
 * Wall clock for the whole mapping run.
 *
 * Sized from measurement, not taste: the 22-column file that first broke this
 * takes ~42s against the root space's ontology, and almost all of it is the one
 * `submitMapping` step emitting a structured row per column. Wider files cost
 * proportionally more, and `MAX_COLUMNS` allows 60.
 *
 * Must stay below `maxDuration`, or the platform kills the request before the
 * budget can turn it into a clean 504.
 */
const TOTAL_BUDGET_MS = 100_000;
/** Hydration costs two entity fetches each; bounded so one call can't stall the budget. */
const MAX_HYDRATIONS_PER_SEARCH = 8;

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin) return process.env.NODE_ENV !== 'production';
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function parseWalletCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(lower) ? lower : null;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return `noip:${crypto.randomUUID()}`;
}

function jsonError(status: number, message: string, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/-/g, '').toLowerCase();
  return /^[a-f0-9]{32}$/.test(normalized) ? normalized : null;
}

/**
 * Validate the request body.
 *
 * Strict about column count and sample size because everything here goes
 * straight into a model prompt — an unbounded body is an unbounded bill.
 */
export function validateInput(body: unknown): ImportMapInput | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;

  const spaceId = normalizeId(raw.spaceId);
  if (!spaceId) return null;

  const fileName = typeof raw.fileName === 'string' ? raw.fileName.slice(0, 200) : '';
  const rowCount = typeof raw.rowCount === 'number' && raw.rowCount >= 0 ? Math.floor(raw.rowCount) : 0;

  if (!Array.isArray(raw.columns) || raw.columns.length === 0 || raw.columns.length > MAX_COLUMNS) return null;

  const columns: MappingColumnInput[] = [];
  for (const entry of raw.columns) {
    if (!entry || typeof entry !== 'object') return null;
    const column = entry as Record<string, unknown>;
    if (typeof column.index !== 'number' || !Number.isInteger(column.index) || column.index < 0) return null;

    columns.push({
      index: column.index,
      header: typeof column.header === 'string' ? column.header.slice(0, 200) : '',
      samples: Array.isArray(column.samples)
        ? column.samples
            .filter((s): s is string => typeof s === 'string')
            .slice(0, MAX_SAMPLES_PER_COLUMN)
            .map(s => (s.length > MAX_SAMPLE_CHARS ? `${s.slice(0, MAX_SAMPLE_CHARS)}…` : s))
        : [],
      filled: typeof column.filled === 'number' && column.filled >= 0 ? Math.floor(column.filled) : 0,
    });
  }

  const hint = typeof raw.hint === 'string' ? raw.hint.trim().slice(0, MAX_HINT_CHARS) : '';

  // Capped: this list widens a search, and an unbounded one from a crafted body
  // would widen it across the whole graph.
  const searchSpaceIds = Array.isArray(raw.searchSpaceIds)
    ? raw.searchSpaceIds
        .map(normalizeId)
        .filter((id): id is string => id !== null)
        .slice(0, MAX_SEARCH_SPACES)
    : [];

  return {
    spaceId,
    fileName,
    rowCount,
    columns,
    ...(hint ? { hint } : {}),
    ...(searchSpaceIds.length > 0 ? { searchSpaceIds } : {}),
  };
}

/** What one column's pre-fetched candidates look like to the model. */
export type ColumnCandidates = Map<number, Array<{ name: string | null; dataType: string; id: string }>>;

/** The file, as the model sees it. Headers and a few values — never rows. */
export function renderColumns(input: ImportMapInput, candidates?: ColumnCandidates): string {
  const lines = input.columns.map(column => {
    const samples = column.samples.length > 0 ? column.samples.map(s => JSON.stringify(s)).join(', ') : '(all blank)';
    const head = `[${column.index}] ${JSON.stringify(column.header)} — ${column.filled}/${input.rowCount} filled — samples: ${samples}`;
    if (!candidates) return head;

    // Every column gets its candidates listed, including the empty case.
    // Deciding a column is unmappable *without looking* is how a canonical
    // `Role` property with an exact name and the right data type came back as
    // "free-text, no matching property" — and that verdict then satisfied the
    // one precondition under which creating a duplicate looks reasonable.
    const found = candidates.get(column.index) ?? [];
    if (found.length === 0) return `${head}\n      candidates: none found`;
    const rendered = found.map(p => `${JSON.stringify(p.name ?? '')} (${p.dataType}, id ${p.id})`).join('; ');
    return `${head}\n      candidates: ${rendered}`;
  });

  return [
    `File: ${input.fileName || '(unnamed)'}`,
    `Rows: ${input.rowCount}`,
    `Space: ${input.spaceId}`,
    '',
    'Columns:',
    ...lines,
    // Last, and framed as an instruction, because it is the only reason this
    // call differs from the one before it. A correction placed above the column
    // list reads as background; placed here it reads as the task.
    ...(input.hint
      ? [
          '',
          'The user has already seen a mapping for this file and asked for a change:',
          JSON.stringify(input.hint),
          'Honour it. Work out the rest as usual, and do not silently return the previous answer.',
        ]
      : []),
  ].join('\n');
}

type PropertyCandidate = {
  id: string;
  name: string | null;
  description: string | null;
  dataType: string;
  /** Null means the ontology does not declare them and the model must supply relationTypeIds. */
  relationValueTypes: Array<{ id: string; name: string | null }> | null;
};

async function hydrateIfRelation(property: Property): Promise<Property> {
  if (property.dataType !== 'RELATION') return property;
  if (property.relationValueTypes && property.relationValueTypes.length > 0) return property;
  try {
    return await hydrateRelationValueTypes(property);
  } catch {
    return property;
  }
}

/**
 * Search properties by name and attach the data the model needs to choose.
 *
 * Two rounds: `getResults` finds candidates by name, `getProperties` batches
 * their data types. Relation properties then get one hydration attempt, because
 * `getProperties` returns `relationValueTypes: []` for every property — the gap
 * that makes the resolver's type filter a no-op downstream.
 */
/**
 * Spaces a candidate property may come from.
 *
 * The search reaches the whole canonical graph, and "canonical" is not the same
 * as "curated ontology" — a scraped content space with 21,000 Articles and News
 * stories is canonical too, and its incidental `Role` text field competes with
 * the real one on equal footing. Restricting to spaces someone has vouched for
 * — the ranked list, the space being imported into, and the user's own — is
 * what keeps a dataset's private vocabulary out of a curator's mapping.
 */
function isTrustedSpace(spaceId: string, allowed: ReadonlySet<string>): boolean {
  const normalized = normalizeId(spaceId);
  if (!normalized) return false;
  return allowed.has(normalized) || getSpaceRank(normalized) !== UNRANKED_SPACE;
}

const UNRANKED_SPACE = Number.MAX_SAFE_INTEGER;

async function searchProperties(queries: string[], spaceId: string, searchSpaces: string[]) {
  const unique = [...new Set(queries.map(q => q.trim()).filter(Boolean))];
  const allowed = new Set(searchSpaces.map(id => normalizeId(id)).filter((id): id is string => id !== null));

  const perQuery = await Promise.all(
    unique.map(async query => {
      try {
        const results = await Effect.runPromise(
          getResults({ query, typeIds: [SystemIds.PROPERTY], additionalSpaceIds: searchSpaces })
        );
        const trusted = results.filter(r => r.spaces.some(s => isTrustedSpace(s.spaceId, allowed)));
        // Ranked *before* the slice, not after. A common header like "Website"
        // matches the same property name across many spaces; taking the API's
        // first six and then ranking them just ranks an arbitrary six.
        return {
          query,
          ids: rankBySpace(trusted, spaceId)
            .slice(0, MAX_RESULTS_PER_QUERY)
            .map(r => r.id),
        };
      } catch (err) {
        // The error, not the query — the query is the user's own column header.
        console.error('[chat/import-map] property search failed', err);
        return { query, ids: [] as string[] };
      }
    })
  );

  const allIds = [...new Set(perQuery.flatMap(r => r.ids))];
  if (allIds.length === 0) return perQuery.map(r => ({ query: r.query, results: [] as PropertyCandidate[] }));

  let properties: Property[] = [];
  try {
    properties = (await Effect.runPromise(getProperties(allIds))) ?? [];
  } catch {
    console.error('[chat/import-map] property fetch failed');
  }

  const relations = properties.filter(p => p.dataType === 'RELATION').slice(0, MAX_HYDRATIONS_PER_SEARCH);
  const hydrated = new Map<string, Property>();
  await Promise.all(
    relations.map(async property => {
      hydrated.set(property.id, await hydrateIfRelation(property));
    })
  );

  const byId = new Map<string, PropertyCandidate>();
  for (const property of properties) {
    const resolved = hydrated.get(property.id) ?? property;
    const types = resolved.relationValueTypes ?? [];
    byId.set(property.id, {
      id: property.id,
      name: resolved.name,
      description: null,
      dataType: resolved.dataType,
      // Null rather than [] so "the ontology is silent" is visibly different
      // from "the ontology says none" — the prompt keys off exactly this.
      relationValueTypes: resolved.dataType === 'RELATION' ? (types.length > 0 ? types : null) : null,
    });
  }

  return perQuery.map(r => ({
    query: r.query,
    results: r.ids.map(id => byId.get(id)).filter((p): p is PropertyCandidate => p !== undefined),
  }));
}

export type TypeCandidate = { id: string; name: string | null };

/**
 * The spaces a type or property may legitimately come from, current one first.
 *
 * Four sources, in precedence order:
 *
 * - the space being imported into — its own vocabulary wins
 * - `extra`: personal and every space this user can edit, computed on the
 *   client by `useGlobalSearchSpaceIds` and sent with the request, since only
 *   the client knows the membership list
 * - the ranked spaces — the curated ontologies. These must be *searched*, not
 *   merely preferred once found: the REST search only surfaces a space's
 *   non-canonical entities when that space is named, so a `Facebook` property
 *   living in Technology stayed invisible even after Technology was trusted.
 *   Ranking sorts candidates; only scope produces them.
 * - root as a floor, because the canonical vocabulary lives there and every
 *   space uses `Person` and `Project` without defining them.
 *
 * The standalone importer searched this set; narrowing it was a regression,
 * found three times in QA before it was traced.
 */
export function typeSourceSpaces(spaceId: string, extra: string[] = []): string[] {
  return dedupe([spaceId, ...extra, ...RANKED_SPACE_IDS, ROOT_SPACE]);
}

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const normalized = normalizeId(id);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/**
 * Order property matches so the best candidate is first.
 *
 * Restores what `use-auto-map-columns.ts` already did and this route lost when
 * it replaced that matcher: rank each match by the best-ranked space it lives
 * in, using the app's existing `getSpaceRank` (Root 0, Education 1, Crypto 2,
 * AI 3, …, everything else last). The current space is treated as rank -1 —
 * ahead of Root — because a property this space defines for itself is the one
 * an import into this space should use.
 *
 * Ordering only. Nothing is dropped that would otherwise have survived; a
 * lower-ranked match still reaches the model if it is inside the cap.
 */
export function rankBySpace<T extends { spaces: Array<{ spaceId: string }> }>(
  matches: T[],
  currentSpaceId: string
): T[] {
  const rankOf = (match: T): number => {
    if (match.spaces.length === 0) return Number.MAX_SAFE_INTEGER;
    return Math.min(...match.spaces.map(s => (s.spaceId === currentSpaceId ? -1 : getSpaceRank(s.spaceId))));
  };

  // Decorated sort: `Array.prototype.sort` is stable, so equal ranks keep the
  // API's own relevance order rather than being reshuffled.
  return matches
    .map((match, index) => ({ match, index, rank: rankOf(match) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.match);
}

/** First occurrence wins, so caller order decides precedence. */
export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * Answer one `listTypes` call.
 *
 * Extracted from the tool so the rule that matters here is testable: a needle
 * is searched **at the source**, never filtered against the page already in
 * hand. Filtering the page looks like a search and behaves like one right up
 * until the type sits past the page boundary — `Person` is #61 in the root
 * space, so a model asking for it got nothing back, asked again in different
 * words, and burned the entire budget hunting a type that was there all along.
 *
 * The search result is also the caller's cue to widen the set of type ids it
 * will accept; a type found this way that `buildMapping` then rejects as
 * unknown is the same bug wearing a different hat.
 */
export async function lookupTypes(args: {
  needle: string | undefined;
  /** The first page, already fetched. Returned verbatim when there is no needle. */
  page: ReadonlyArray<TypeCandidate>;
  /** Whether more types exist beyond `page`. */
  pageTruncated: boolean;
  search: (needle: string) => Promise<TypeCandidate[]>;
}): Promise<{ types: TypeCandidate[]; truncated: boolean }> {
  const needle = args.needle?.trim();
  if (!needle) return { types: [...args.page], truncated: args.pageTruncated };

  try {
    return { types: await args.search(needle), truncated: false };
  } catch (err) {
    console.error('[chat/import-map] type search failed', err);
    // Fall back to the page rather than returning nothing: an empty result is
    // exactly what sends the model round the loop again.
    const lowered = needle.toLowerCase();
    return {
      types: args.page.filter(t => (t.name ?? '').toLowerCase().includes(lowered)),
      truncated: true,
    };
  }
}

/**
 * Can this rule read anything at all out of this column?
 *
 * A dry run of the model's own coercion choice over the samples it was shown.
 * `text` reads everything, so this only ever fires on a genuine mismatch —
 * `integer` chosen for a column of names, say — where every row would otherwise
 * become the empty string and the column would land in the space as a property
 * present on every entity and set on none.
 *
 * Placeholders (`N/A`, `-`) are not evidence either way: a column whose samples
 * are all placeholders has nothing to disprove, so it passes.
 */
export function coercionFitsSamples(rule: string, samples: string[]): boolean {
  if (!isCoercionRule(rule)) return false;

  let testable = 0;
  for (const sample of samples) {
    if (isPlaceholder(sample)) continue;
    testable++;
    if (coerce(rule, sample).ok) return true;
  }

  return testable === 0;
}

/**
 * Columns the model skipped that it had no grounds to skip.
 *
 * A skip is a claim — "nothing here fits" — and unlike the rest of the
 * submission it used to be accepted without ever being checked against the
 * candidate list we had already fetched and shown. Two runs over the same file
 * disagreed on exactly this: one mapped `role` to `Roles`, the next skipped it
 * as "no matching job title or role" with the same candidates on screen.
 *
 * A column with no candidates is not contested — there really was nothing to
 * see. Nor is an empty column, which has no data to place.
 */
export function contestedSkips(
  columns: readonly SubmittedColumn[],
  input: ImportMapInput,
  candidates: ColumnCandidates,
  nameColumn: number
): MappingColumnInput[] {
  const byIndex = new Map(input.columns.map(c => [c.index, c]));
  const contested: MappingColumnInput[] = [];

  for (const raw of columns) {
    if (raw.kind !== 'skip' || raw.index === nameColumn) continue;

    const column = byIndex.get(raw.index);
    if (!column || column.filled === 0) continue;
    if ((candidates.get(raw.index)?.length ?? 0) === 0) continue;

    contested.push(column);
  }

  return contested;
}

/**
 * Fold a second look back into the submission it revises.
 *
 * Only the contested columns are replaced. The rest of the mapping is the
 * model's first answer verbatim, which is the point: asking for a full
 * re-submission would let columns nobody questioned change too, and in testing
 * they did — two runs over one file disagreed on three columns that were never
 * in dispute.
 */
export function mergeRevisions(
  submission: SubmitMappingInput,
  revised: ReadonlyMap<number, SubmittedColumn>
): SubmitMappingInput {
  if (revised.size === 0) return submission;

  return {
    ...submission,
    columns: submission.columns.map(column => revised.get(column.index) ?? column),
  };
}

/**
 * Turn the model's submission into the mapping, dropping anything that doesn't
 * hold up.
 *
 * Two kinds of check run here. The original ones are about *shape* — is the id
 * well-formed, is the type one we showed you, is the coercion rule real. The
 * later ones are about *evidence*: the column's own `filled` count and samples
 * travelled with the request, and a decision that contradicts them is not a
 * judgement call we should be honouring. Both directions failed in testing —
 * one run skipped a full column it had candidates for, the next mapped two
 * columns it had been told were `filled: 0`.
 *
 * Every rejection here degrades to `skip` rather than failing the import: a
 * column we cannot trust is a column left out, which is the same outcome the
 * model would have chosen if it had been sure.
 */
export function buildMapping(
  submission: SubmitMappingInput,
  input: ImportMapInput,
  knownTypeIds: ReadonlySet<string>,
  candidates?: ColumnCandidates
): ImportMapping | { error: 'mapping_failed' } {
  const typeId = normalizeId(submission.typeId);
  if (!typeId || !knownTypeIds.has(typeId)) return { error: 'mapping_failed' };

  const validIndices = new Set(input.columns.map(c => c.index));
  if (!validIndices.has(submission.nameColumn)) return { error: 'mapping_failed' };

  const byIndex = new Map(input.columns.map(c => [c.index, c]));
  const seen = new Set<number>();
  const columns: MappedColumn[] = [];

  const skip = (index: number, reason: string): MappedColumn => {
    // Only a column with data is worth a second opinion. An empty one may well
    // have candidates — a blank `YouTube` column still matches the `YouTube`
    // property — but there is nothing in it to import, so telling the curator
    // we turned down a match would send them looking at nothing.
    const reviewable = (byIndex.get(index)?.filled ?? 0) > 0 && (candidates?.get(index)?.length ?? 0) > 0;

    return { index, kind: 'skip', reason, ...(reviewable ? { hadCandidates: true } : {}) };
  };

  for (const raw of submission.columns) {
    if (!validIndices.has(raw.index) || seen.has(raw.index)) continue;
    // The name column is carried separately; a property mapping for it as well
    // would write the name twice.
    if (raw.index === submission.nameColumn) {
      seen.add(raw.index);
      continue;
    }
    seen.add(raw.index);

    const column = byIndex.get(raw.index);
    const propertyId = normalizeId(raw.propertyId);

    // An empty column is not a judgement call — nothing in it can be imported,
    // and mapping it anyway puts a property on every entity with a value on
    // none. `filled` was in the payload; a mapping that contradicts it is wrong
    // regardless of how good the property match was.
    if (column && column.filled === 0) {
      columns.push(skip(raw.index, 'Column is empty.'));
      continue;
    }

    if (raw.kind === 'skip' || !propertyId) {
      columns.push(skip(raw.index, raw.reason?.slice(0, 200) || 'No matching property.'));
      continue;
    }

    if (raw.kind === 'relation') {
      const relationTypeIds = (raw.relationTypeIds ?? [])
        .map(normalizeId)
        .filter((id): id is string => id !== null && knownTypeIds.has(id));

      columns.push({
        index: raw.index,
        kind: 'relation',
        propertyId,
        propertyName: raw.propertyName?.slice(0, 200) || 'Relation',
        relationTypeIds,
        // An unrecognised rule falls back to the default rather than failing the
        // column: `list` is what this code did before the rule existed.
        split: isRelationSplitRule(raw.split) ? raw.split : 'list',
      });
      continue;
    }

    if (!isCoercionRule(raw.coercion)) {
      columns.push(skip(raw.index, 'Could not tell how to convert this column safely.'));
      continue;
    }

    // The rule is real, but is it right for *these* values? Every sample
    // failing means every row would too, and the column would import as a
    // property that is set nowhere.
    if (column && !coercionFitsSamples(raw.coercion, column.samples)) {
      columns.push(skip(raw.index, 'These values could not be read as that property expects.'));
      continue;
    }

    columns.push({
      index: raw.index,
      kind: 'value',
      propertyId,
      propertyName: raw.propertyName?.slice(0, 200) || 'Property',
      coercion: raw.coercion,
    });
  }

  // Anything the model forgot is skipped rather than silently absent, so the
  // user sees one row per column of their file.
  for (const column of input.columns) {
    if (seen.has(column.index) || column.index === submission.nameColumn) continue;
    columns.push(skip(column.index, 'Not mapped.'));
  }

  columns.sort((a, b) => a.index - b.index);

  return {
    typeId,
    typeName: submission.typeName?.slice(0, 200) || 'Type',
    nameColumn: submission.nameColumn,
    columns,
    summary: submission.summary?.slice(0, 600) || 'Mapped the file onto this space.',
  };
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, 'Forbidden');

  const cookieStore = await cookies();
  const wallet = parseWalletCookie(cookieStore.get(WALLET_ADDRESS)?.value);
  if (!wallet) return jsonError(401, 'Sign in to import a file.');

  const ip = getClientIp(req);
  try {
    const [identity, ipCeiling] = await Promise.all([loggedInLimit.limit(wallet), ipCeilingLimit.limit(ip)]);
    if (!identity.success || !ipCeiling.success) {
      const reset = Math.max(identity.success ? 0 : identity.reset, ipCeiling.success ? 0 : ipCeiling.reset);
      const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      return jsonError(429, 'Rate limit exceeded.', { 'Retry-After': retryAfter.toString() });
    }
  } catch (err) {
    console.error('[chat/import-map] rate limiter unavailable', err);
    if (process.env.NODE_ENV === 'production') return jsonError(503, 'Service temporarily unavailable.');
  }

  let input: ImportMapInput;
  try {
    const validated = validateInput(await req.json());
    if (!validated) return jsonError(400, 'Invalid request body');
    input = validated;
  } catch {
    return jsonError(400, 'Invalid request body');
  }

  const budget = AbortSignal.timeout(TOTAL_BUDGET_MS);
  const signal = req.signal ? AbortSignal.any([req.signal, budget]) : budget;

  // Fetched up front rather than left to the model: the type set bounds what
  // `submitMapping` may claim, so it has to exist before validation can happen.
  //
  // The *browse* list: current space and root only, fetched separately and
  // merged — never one query over both. Spaces use types they do not define
  // (the AI space holds 1,535 Projects while the `Project` type lives in root),
  // but a union query is no better, because root defines hundreds of types and
  // crowds the current space's own vocabulary off the page. Current first, so
  // its types are the ones that survive.
  //
  // Deliberately narrower than `searchSpaceIds`: this is an opening list, one
  // request per space, and it is `nameContains` below — a single query over
  // every space the user can reach — that has to find anything specific.
  // Browse is one request per space, so it stays at two. Search is one request
  // covering all of them, so it can be wide.
  const browseSpaces = dedupe([input.spaceId, ROOT_SPACE]);
  const searchSpaces = typeSourceSpaces(input.spaceId, input.searchSpaceIds);
  const allowedSpaces = new Set(searchSpaces);
  let spaceTypes: Array<{ id: string; name: string | null }> = [];
  let moreTypesExist = false;
  try {
    const pages = await Promise.all(
      browseSpaces.map(spaceId =>
        Effect.runPromise(
          getAllEntities({ spaceId, typeId: SystemIds.SCHEMA_TYPE, limit: MAX_TYPES_PER_SPACE }, signal)
        )
      )
    );
    spaceTypes = dedupeById(
      pages.flatMap(page => page.entities.map(e => ({ id: normalizeId(e.id) ?? e.id, name: e.name })))
    );
    moreTypesExist = pages.some(p => p.hasNextPage || p.entities.length >= MAX_TYPES_PER_SPACE);
  } catch (err) {
    console.error('[chat/import-map] type lookup failed', err);
    return jsonError(502, 'Could not read the space ontology.');
  }

  if (spaceTypes.length === 0) {
    return new Response(JSON.stringify({ error: 'no_types_in_space' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Every type id the model is allowed to name, grown as searches surface more.
   *
   * Seeded from the first page and *not* closed: a big space has far more types
   * than `MAX_TYPES`, so a type found by search has to become nameable, or
   * `buildMapping` rejects the very answer the search was for.
   */
  const knownTypeIds = new Set(spaceTypes.map(t => t.id));
  let submission: SubmitMappingInput | null = null;
  /**
   * Set once the submission has cleared its checks, or once the model has had
   * its one second look. Drives `stopWhen`, so the loop ends on an *accepted*
   * mapping rather than on the mere fact that `submitMapping` was called.
   */
  let accepted = false;
  let contestRounds = 0;
  const revised = new Map<number, SubmittedColumn>();

  const listTypes = tool({
    description:
      'List or search the entity types this space defines. Every imported row becomes one of these. ' +
      'Pass `nameContains` to search the whole space; omit it for the first page of types.',
    inputSchema: jsonSchema<ListTypesInput>(LIST_TYPES_SCHEMA),
    execute: async ({ nameContains }: ListTypesInput) => {
      const result = await lookupTypes({
        needle: nameContains,
        page: spaceTypes,
        pageTruncated: moreTypesExist,
        // One query across every reachable space, not one per space. A name
        // needle already narrows the result set, so root cannot bury anything
        // here the way it does in the unfiltered list — and widening costs a
        // single request rather than one per space. Ranked so the current
        // space's own type still wins a tie.
        search: async needle => {
          const results = await Effect.runPromise(
            getResults(
              {
                query: needle,
                typeIds: [SystemIds.SCHEMA_TYPE],
                additionalSpaceIds: searchSpaces,
                limit: MAX_TYPE_MATCHES,
              },
              signal
            )
          );
          // Same trust filter as properties: a content dataset is canonical
          // too, and its incidental types are not this space's ontology.
          const trusted = results.filter(r => r.spaces.some(s => isTrustedSpace(s.spaceId, allowedSpaces)));
          return dedupeById(
            rankBySpace(trusted, input.spaceId).map(r => ({ id: normalizeId(r.id) ?? r.id, name: r.name }))
          );
        },
      });

      // A type is only nameable once it has been seen. Searching is how types
      // past the first page get seen, so registering here is what lets
      // `buildMapping` accept the answer the search was for.
      for (const type of result.types) knownTypeIds.add(type.id);
      return result;
    },
  });

  const searchPropertiesTool = tool({
    description:
      'Search this space and its neighbours for existing properties by name. Send every header you still need in one call. Returns each property with its dataType, and — for relations — the entity types it is declared to point at, or null when the ontology does not say.',
    inputSchema: jsonSchema<SearchPropertiesInput>(SEARCH_PROPERTIES_SCHEMA),
    execute: async ({ queries }: SearchPropertiesInput) => ({
      matches: await searchProperties(queries, input.spaceId, searchSpaces),
    }),
  });

  const submitMapping = tool({
    description: 'Submit the finished mapping. Call this exactly once, when every column is accounted for.',
    inputSchema: jsonSchema<SubmitMappingInput>(SUBMIT_MAPPING_SCHEMA),
    execute: async (mapping: SubmitMappingInput) => {
      submission = mapping;

      // A skip is the one decision that was never checked against what we
      // showed the model. Check it now, and hand back only the columns that
      // conflict — with their candidates restated, since by this point they are
      // many steps back in the conversation.
      const contested = contestedSkips(mapping.columns, input, candidates, mapping.nameColumn);
      if (contested.length > 0 && contestRounds < MAX_CONTEST_ROUNDS) {
        contestRounds++;
        return {
          accepted: false,
          message:
            'These columns were skipped, but they hold data and matching properties were found for them. ' +
            'Look again and call reconsiderColumns. Skipping is still allowed if none of these properties genuinely fit — say which you rejected and why.',
          reconsider: contested.map(column => ({
            index: column.index,
            header: column.header,
            filled: column.filled,
            samples: column.samples,
            yourReason: mapping.columns.find(c => c.index === column.index)?.reason ?? '',
            candidates: (candidates.get(column.index) ?? []).map(p => ({
              id: p.id,
              name: p.name,
              dataType: p.dataType,
            })),
          })),
        };
      }

      accepted = true;
      return { accepted: true };
    },
  });

  const reconsiderColumns = tool({
    description:
      'Revise the columns you were asked to reconsider. Send only those columns — everything else in your mapping stands.',
    inputSchema: jsonSchema<ReconsiderColumnsInput>(RECONSIDER_COLUMNS_SCHEMA),
    execute: async ({ columns, summary }: ReconsiderColumnsInput) => {
      for (const column of columns) revised.set(column.index, column);
      if (summary && submission) submission = { ...submission, summary };
      accepted = true;
      return { accepted: true, revised: columns.length };
    },
  });

  // Look up every column before the model sees the file.
  //
  // The model used to choose which headers were worth searching, which meant a
  // column it had already judged unmappable was never looked up at all. Doing
  // it here makes the lookup unconditional: the model may still skip a column,
  // but only after being shown what exists. It is also usually faster, because
  // the searches it would have made are now one parallel batch instead of one
  // or two extra model round trips.
  const candidates: ColumnCandidates = new Map();
  const tSearch = Date.now();
  try {
    const headers = input.columns.map(c => c.header).filter(Boolean);
    const matches = await searchProperties(headers, input.spaceId, searchSpaces);
    const byQuery = new Map(matches.map(m => [m.query.trim().toLowerCase(), m.results]));
    for (const column of input.columns) {
      const found = byQuery.get(column.header.trim().toLowerCase()) ?? [];
      candidates.set(
        column.index,
        found.map(p => ({ name: p.name, dataType: p.dataType, id: p.id }))
      );
    }
  } catch (err) {
    // A failed pre-search is a worse mapping, not a failed one — the model
    // still has `searchProperties` and can do it the old way.
    console.error('[chat/import-map] pre-search failed', err);
  }
  const searchMs = Date.now() - tSearch;

  // Which tools ran, and for how long. Logged whenever the budget blows, and in
  // development always: "exceeded budget" on its own says nothing about *what*
  // ran long, and the answer the first time turned out to be the model calling
  // one tool nine times over.
  const trace: string[] = [`pre-search(${input.columns.length} cols) ${searchMs}ms`];
  let stepMark = Date.now();

  try {
    const result = await generateText({
      onStepFinish: step => {
        const now = Date.now();
        trace.push(`${step.toolCalls.map(c => c.toolName).join(',') || '(text)'} ${now - stepMark}ms`);
        stepMark = now;
      },
      model: anthropic(RESEARCH_MODEL),
      // Cached: the prompt is long and re-sent on every one of up to
      // MAX_TOOL_STEPS passes. Same breakpoint as geo-query and the main route.
      messages: [
        {
          role: 'system',
          content: IMPORT_MAP_SYSTEM_PROMPT,
          providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
        },
        { role: 'user', content: renderColumns(input, candidates) },
      ],
      tools: { listTypes, searchProperties: searchPropertiesTool, submitMapping, reconsiderColumns },
      toolChoice: 'auto',
      // The mapping is the answer, so the run is over the moment it lands.
      // Without this the model spends a whole extra round trip — measured at
      // ~7s — writing a closing paragraph that nothing reads.
      //
      // Keyed on acceptance rather than on `hasToolCall('submitMapping')`: a
      // submission whose skips are contested is not the answer yet, and the
      // loop has to survive long enough for the second look.
      stopWhen: [() => accepted, stepCountIs(MAX_TOOL_STEPS)],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: signal,
    });

    // `usage` is the last step only, and this loops.
    logCallCost('import-map', RESEARCH_MODEL, result.totalUsage);
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[chat/import-map] ${trace.length} steps: ${trace.join(' → ')}`);
    }

    if (!submission) {
      console.error('[chat/import-map] finished without submitting a mapping');
      return new Response(JSON.stringify({ error: 'mapping_failed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const mapping = buildMapping(mergeRevisions(submission, revised), input, knownTypeIds, candidates);
    return new Response(JSON.stringify(mapping), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (budget.aborted) {
      // Headers are the user's own column names — same bar as logCallCost,
      // which stays out of production logs unless CHAT_DEBUG is set.
      const steps = trace.length > 0 ? ` after ${trace.length} steps: ${trace.join(' → ')}` : '';
      if (process.env.NODE_ENV !== 'production' || process.env.CHAT_DEBUG === '1') {
        console.error(`[chat/import-map] exceeded budget${steps}`, input.fileName);
      } else {
        console.error(`[chat/import-map] exceeded budget${steps}`);
      }
      return jsonError(504, 'Mapping took too long');
    }
    console.error('[chat/import-map] generation failed', err);
    return jsonError(502, 'Mapping failed');
  }
}
