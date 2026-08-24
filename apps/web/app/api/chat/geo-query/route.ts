// POST /api/chat/geo-query — sub-agent that answers a read question by writing
// and running GraphQL against the Geo API.
//
// Isolated as a sub-agent (same shape as /api/chat/research) for two reasons.
// The geo-query skill is ~8k tokens; in the main system prompt it would be
// re-read on every one of a turn's 4-5 executor passes, on every turn, whether
// used or not. And the skill's workflows assume a loop — query, read the error,
// fix the query — which the main executor doesn't have to spare.
import { createAnthropic } from '@ai-sdk/anthropic';

import { generateText, jsonSchema, stepCountIs, tool } from 'ai';
import { cookies } from 'next/headers';

import type { GeoQueryRow } from '~/core/chat/geo-query-types';
import { WALLET_ADDRESS } from '~/core/cookie';

import { logCallCost } from '../cost';
import { RESEARCH_MODEL } from '../models';
import { ipCeilingLimit, loggedInLimit } from '../rate-limit';
import { runGeoGraphql } from './graphql';
import { GEO_QUERY_SYSTEM_PROMPT } from './system-prompt';

const anthropic = createAnthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const MAX_QUESTION_CHARS = 500;
const MAX_ANSWER_CHARS = 4_000;
// Rows are a courtesy, not the payload. The answer carries the finding; these
// let the UI render pills. A block can hold 1,000 entities and none of them
// belong in the main turn's context.
const MAX_ROWS = 50;
// Enough for discover → query → fix a mistake → confirm. Beyond this it is
// flailing, and flailing slowly: the user is watching a spinner.
const MAX_TOOL_STEPS = 8;
const MAX_OUTPUT_TOKENS = 2_000;
// Whole-invocation budget, distinct from the per-query timeout in graphql.ts.
const TOTAL_BUDGET_MS = 30_000;

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

function rateLimitResponse(reset: number) {
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return jsonError(429, 'Rate limit exceeded.', { 'Retry-After': retryAfter.toString() });
}

export function validateQuestion(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_QUESTION_CHARS) return null;
  return trimmed;
}

export function clampAnswer(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_ANSWER_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_ANSWER_CHARS - 1).trimEnd()}…`;
}

/**
 * Pull renderable rows out of whatever the sub-agent selected.
 *
 * Deliberately forgiving: the sub-agent writes its own queries, so the response
 * shape isn't fixed. Anything with an `id` and a `name` is a row; everything
 * else is ignored rather than guessed at. Rows are a bonus — the answer is the
 * product — so failing to find any is normal, never an error.
 */
export function collectRows(data: unknown, limit = MAX_ROWS): GeoQueryRow[] {
  const rows: GeoQueryRow[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown, depth: number): void => {
    if (rows.length >= limit || depth > 6 || node === null || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }

    const record = node as Record<string, unknown>;
    const id = record.id;
    if (typeof id === 'string' && /^[a-f0-9]{32}$/i.test(id) && !seen.has(id)) {
      const name = record.name;
      // Require a name: an id-only object is usually a nested reference (a
      // relation edge, a type stub), not a row the user asked to see.
      if (typeof name === 'string' && name.length > 0) {
        seen.add(id);
        const spaceIds = record.spaceIds;
        rows.push({
          id,
          name,
          spaceId: Array.isArray(spaceIds) && typeof spaceIds[0] === 'string' ? spaceIds[0] : null,
        });
        if (rows.length >= limit) return;
      }
    }

    for (const value of Object.values(record)) visit(value, depth + 1);
  };

  visit(data, 0);
  return rows;
}

/**
 * The `totalCount` from a `*Connection`, if the sub-agent asked for one.
 *
 * Matters because `rows` is capped: without the true total, "here are 50" reads
 * as "there are 50". The skill's cheapest query is exactly this shape —
 * `first: 0` with `totalCount` — so a count question often returns no rows at
 * all and this is the entire answer.
 *
 * Shallowest wins: a query can nest connections (entities → their relations),
 * and the outer count is the one that answers the question asked.
 */
export function collectTotalCount(data: unknown): number | undefined {
  let queue: unknown[] = [data];

  for (let depth = 0; depth <= 6 && queue.length > 0; depth++) {
    const next: unknown[] = [];

    for (const node of queue) {
      if (node === null || typeof node !== 'object') continue;
      if (Array.isArray(node)) {
        next.push(...node);
        continue;
      }
      const record = node as Record<string, unknown>;
      if (typeof record.totalCount === 'number') return record.totalCount;
      next.push(...Object.values(record));
    }

    queue = next;
  }

  return undefined;
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return jsonError(403, 'Forbidden');
  }

  const cookieStore = await cookies();
  const wallet = parseWalletCookie(cookieStore.get(WALLET_ADDRESS)?.value);
  // Members only — reads need no auth at the API, but this is the most
  // expensive tool the assistant has.
  if (!wallet) {
    return jsonError(401, 'Sign in to query the graph.');
  }
  const ip = getClientIp(req);

  try {
    const [identity, ipCeiling] = await Promise.all([loggedInLimit.limit(wallet), ipCeilingLimit.limit(ip)]);
    if (!identity.success || !ipCeiling.success) {
      const reset = Math.max(identity.success ? 0 : identity.reset, ipCeiling.success ? 0 : ipCeiling.reset);
      return rateLimitResponse(reset);
    }
  } catch (err) {
    console.error('[chat/geo-query] rate limiter unavailable', err);
    if (process.env.NODE_ENV === 'production') {
      return jsonError(503, 'Service temporarily unavailable.');
    }
  }

  let question: string;
  try {
    const body = await req.json();
    const validated = validateQuestion(body?.question);
    if (!validated) return jsonError(400, 'Invalid request body');
    question = validated;
  } catch {
    return jsonError(400, 'Invalid request body');
  }

  const budget = AbortSignal.timeout(TOTAL_BUDGET_MS);
  const signal = req.signal ? AbortSignal.any([req.signal, budget]) : budget;

  // Every query the sub-agent runs, in order, so the caller can show its work.
  const executed: string[] = [];
  // The last successful response. Rows and totals come from whatever the
  // sub-agent looked at last, which is the query it based its answer on —
  // earlier ones were discovery or corrected mistakes.
  let lastData: unknown = null;

  const runQuery = tool({
    description:
      'Run one GraphQL query against the Geo API. Returns the `data` object, or the full error text so you can correct the query and try again.',
    inputSchema: jsonSchema<{ query: string; variables?: Record<string, unknown> }>({
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, description: 'The GraphQL query document.' },
        variables: { type: 'object', description: 'Optional variables object.', additionalProperties: true },
      },
      required: ['query'],
      additionalProperties: false,
    }),
    execute: async ({ query, variables }: { query: string; variables?: Record<string, unknown> }) => {
      executed.push(query);
      const result = await runGeoGraphql(query, variables, signal);
      if (!result.ok) return { error: result.error };
      lastData = result.data;
      return { data: result.data };
    },
  });

  try {
    const result = await generateText({
      model: anthropic(RESEARCH_MODEL),
      // Cached rather than passed as `system`: the skill is ~8k tokens and is
      // re-sent on every one of up to MAX_TOOL_STEPS passes, so an uncached
      // prompt spends TOTAL_BUDGET_MS re-reading instructions instead of
      // querying. Same breakpoint the main chat route uses.
      messages: [
        {
          role: 'system',
          content: GEO_QUERY_SYSTEM_PROMPT,
          providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
        },
        { role: 'user', content: question },
      ],
      tools: { runQuery },
      toolChoice: 'auto',
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: signal,
    });

    // `usage` is the last step only; this loops for up to MAX_TOOL_STEPS.
    logCallCost('geo-query', RESEARCH_MODEL, result.totalUsage);

    const answer = clampAnswer(result.text);
    if (answer.length === 0) {
      return jsonError(502, 'Query produced no answer');
    }

    const totalCount = collectTotalCount(lastData);

    return new Response(
      JSON.stringify({
        answer,
        rows: collectRows(lastData),
        ...(totalCount === undefined ? {} : { totalCount }),
        queries: executed,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    if (budget.aborted) {
      // The timeout itself is always worth knowing about, but the question is
      // the user's own words plus resolved ids — held to the same bar as
      // `logCallCost`, which stays out of production unless CHAT_DEBUG is set.
      if (process.env.NODE_ENV !== 'production' || process.env.CHAT_DEBUG === '1') {
        console.error('[chat/geo-query] exceeded budget', question);
      } else {
        console.error('[chat/geo-query] exceeded budget');
      }
      return jsonError(504, 'Query took too long');
    }
    console.error('[chat/geo-query] generation failed', err);
    return jsonError(502, 'Query failed');
  }
}
