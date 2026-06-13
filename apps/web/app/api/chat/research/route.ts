// POST /api/chat/research — sub-agent that runs Anthropic's hosted webSearch +
// a Haiku summarizer and returns a tight summary plus source URLs. Isolating
// it keeps Anthropic's encrypted_content out of the main turn's context.
import { createAnthropic } from '@ai-sdk/anthropic';

import { generateText, stepCountIs } from 'ai';
import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';

import { logCallCost } from '../cost';
import { RESEARCH_MODEL } from '../models';
import { ipCeilingLimit, loggedInLimit } from '../rate-limit';

const anthropic = createAnthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const MAX_QUERY_CHARS = 500;
const MAX_SUMMARY_CHARS = 8_000;
const MAX_SOURCES = 8;
const WEB_SEARCH_MAX_USES = 5;
const MAX_TOOL_STEPS = 6;
const MAX_OUTPUT_TOKENS = 2_500;

const SYSTEM_PROMPT = `You are a researcher subagent. The orchestrating assistant gives you a single focused query; you call webSearch to gather facts and reply with a thorough extraction.

Rules:
- Use webSearch (up to ${WEB_SEARCH_MAX_USES} calls). Search Geo's graph is the orchestrator's job — you only handle the open web.
- Extract thoroughly. Your reply is downstream input for an ingestion step that turns the answer into structured entities and properties, so pull every concrete fact your sources state: names, dates, locations, organizations, roles, relationships, numbers, identifiers, descriptions, categorizations, and any other attributes attached to the subject. Do not omit details that are plainly present in the results.
- Prefer compact structure over prose: lead with a 1–2 sentence overview, then list the extracted facts as short markdown bullets (one fact per bullet, name the field where it's obvious — e.g. \`Founded: 1998\`, \`Headquarters: Mountain View, CA\`, \`Founders: Larry Page, Sergey Brin\`). Group related bullets under bold subheaders when there are several categories.
- Do not pad, summarize away, or generalize concrete facts. If the sources list ten board members, list all ten. Do not say "various people" or "several locations". Only what the sources actually state — never invent or infer beyond them.
- Cite specific claims inline as standard markdown links: \`[Page title](https://...)\`. Never invent URLs — every link must come from a webSearch result this turn.
- If results are thin or contradictory, say so plainly. Don't fabricate.
- No preamble, no "I searched the web for…". The orchestrator will paste your reply into a longer answer or use it to stage entities, so keep it self-contained.`;

type ResearchSource = { url: string; title: string | null };

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

function validateQuery(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_QUERY_CHARS) return null;
  return trimmed;
}

function clampSummary(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_SUMMARY_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd()}…`;
}

// Walk both the older tool-result shape and the newer `sources` shape so pills
// don't silently disappear after a provider SDK bump.
type StepLike = {
  toolResults?: ReadonlyArray<{ toolName?: string; output?: unknown }>;
  sources?: ReadonlyArray<{ sourceType?: string; url?: unknown; title?: unknown }>;
};

function pushSource(seen: Set<string>, sources: ResearchSource[], url: unknown, title: unknown): boolean {
  if (typeof url !== 'string' || url.length === 0) return false;
  if (seen.has(url)) return false;
  seen.add(url);
  sources.push({ url, title: typeof title === 'string' && title.length > 0 ? title : null });
  return sources.length >= MAX_SOURCES;
}

function collectSources(steps: StepLike[]): ResearchSource[] {
  const seen = new Set<string>();
  const sources: ResearchSource[] = [];
  for (const step of steps) {
    for (const source of step.sources ?? []) {
      if (source.sourceType && source.sourceType !== 'url') continue;
      if (pushSource(seen, sources, source.url, source.title)) return sources;
    }
    for (const result of step.toolResults ?? []) {
      if (result.toolName !== 'webSearch') continue;
      const output = result.output;
      if (!Array.isArray(output)) continue;
      for (const raw of output) {
        if (!raw || typeof raw !== 'object') continue;
        const r = raw as Record<string, unknown>;
        if (pushSource(seen, sources, r.url, r.title)) return sources;
      }
    }
  }
  return sources;
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return jsonError(403, 'Forbidden');
  }

  const cookieStore = await cookies();
  const wallet = parseWalletCookie(cookieStore.get(WALLET_ADDRESS)?.value);
  // Members only.
  if (!wallet) {
    return jsonError(401, 'Sign in to use research.');
  }
  const ip = getClientIp(req);

  try {
    const [identity, ipCeiling] = await Promise.all([loggedInLimit.limit(wallet), ipCeilingLimit.limit(ip)]);
    if (!identity.success || !ipCeiling.success) {
      const reset = Math.max(identity.success ? 0 : identity.reset, ipCeiling.success ? 0 : ipCeiling.reset);
      return rateLimitResponse(reset);
    }
  } catch (err) {
    console.error('[chat/research] rate limiter unavailable; failing closed', err);
    return jsonError(503, 'Service temporarily unavailable.');
  }
  let query: string;
  try {
    const body = await req.json();
    const validated = validateQuery(body?.query);
    if (!validated) return jsonError(400, 'Invalid query');
    query = validated;
  } catch {
    return jsonError(400, 'Invalid request body');
  }

  try {
    const result = await generateText({
      model: anthropic(RESEARCH_MODEL),
      system: SYSTEM_PROMPT,
      prompt: query,
      tools: {
        webSearch: anthropic.tools.webSearch_20250305({ maxUses: WEB_SEARCH_MAX_USES }),
      },
      toolChoice: 'auto',
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      providerOptions: {
        anthropic: { disableParallelToolUse: true },
      },
    });

    logCallCost('research', RESEARCH_MODEL, result.totalUsage);

    const summary = clampSummary(result.text ?? '');
    if (summary.length === 0) {
      return jsonError(502, 'Research returned no summary.');
    }

    const sources = collectSources(result.steps as unknown as StepLike[]);

    return new Response(JSON.stringify({ summary, sources }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[chat/research] generation failed', err);
    return jsonError(502, 'Research failed.');
  }
}
