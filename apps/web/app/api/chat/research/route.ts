// POST /api/chat/research
//
// Researcher sub-agent. The main assistant calls this via the `research`
// client tool with a focused query; this endpoint runs Anthropic's hosted
// `webSearch` + a Haiku summarizer and returns ONLY a tight summary plus the
// list of source URLs. The orchestrator never sees Anthropic's encrypted_content,
// which is what was blowing up the main turn's context budget.
import { createAnthropic } from '@ai-sdk/anthropic';

import { generateText, stepCountIs } from 'ai';
import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';

import { RESEARCH_MODEL } from '../models';
import { ipCeilingHourlyLimit, loggedInHourlyLimit } from '../rate-limit';

const anthropic = createAnthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const MAX_QUERY_CHARS = 500;
const MAX_SUMMARY_CHARS = 4_000;
const MAX_SOURCES = 8;
const WEB_SEARCH_MAX_USES = 5;
const MAX_TOOL_STEPS = 6;
const MAX_OUTPUT_TOKENS = 1_500;

const SYSTEM_PROMPT = `You are a researcher subagent. The orchestrating assistant gives you a single focused query; you call webSearch to gather facts and reply with a tight summary.

Rules:
- Use webSearch (up to ${WEB_SEARCH_MAX_USES} calls). Search Geo's graph is the orchestrator's job — you only handle the open web.
- Reply in 1–3 short paragraphs. Lead with the most useful facts; no preamble, no "I searched the web for…".
- Cite specific claims inline as standard markdown links: \`[Page title](https://...)\`. Never invent URLs — every link must come from a webSearch result this turn.
- If results are thin or contradictory, say so plainly. Don't fabricate.
- The orchestrator will paste your reply into a longer answer for the user, so keep it self-contained and skimmable.`;

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

// Anthropic's hosted webSearch results land via two paths in the SDK depending
// on version: as a tool-result entry on the step (older shape) and as a
// top-level `sources` array of `{ type: 'source', sourceType: 'url', url, title }`
// entries (newer provider shape). Walk both so source pills don't silently
// disappear after a provider SDK bump.
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
  if (!wallet) {
    // Members only — guests don't get web research (matches the prior
    // members-only webSearch policy).
    return jsonError(401, 'Sign in to use research.');
  }
  const ip = getClientIp(req);

  try {
    const [hourly, ipHourly] = await Promise.all([loggedInHourlyLimit.limit(wallet), ipCeilingHourlyLimit.limit(ip)]);
    if (!hourly.success || !ipHourly.success) {
      const reset = Math.max(hourly.success ? 0 : hourly.reset, ipHourly.success ? 0 : ipHourly.reset);
      return rateLimitResponse(reset);
    }
  } catch (err) {
    console.error('[chat/research] rate limiter unavailable', err);
    if (process.env.NODE_ENV === 'production') {
      return jsonError(503, 'Service temporarily unavailable.');
    }
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
