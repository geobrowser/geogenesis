// POST /api/chat/inject-followups — generates 1–3 short next-step suggestions
// after a URL import (the inject pipeline) so the user gets the same follow-up
// pills the chat-driven edit flow produces via the main route's Stage D. The
// inject path never touches /api/chat, so this is its dedicated equivalent.
import { createAnthropic } from '@ai-sdk/anthropic';

import { generateObject, jsonSchema } from 'ai';
import { cookies } from 'next/headers';

import type { InjectType } from '~/core/chat/inject-types';
import { WALLET_ADDRESS } from '~/core/cookie';

import { logCallCost } from '../cost';
import { FOLLOW_UPS_MODEL } from '../models';
import { ipCeilingLimit, loggedInLimit } from '../rate-limit';

const anthropic = createAnthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const MAX_NAME_CHARS = 300;
const VALID_TYPES: ReadonlySet<InjectType> = new Set(['news-story-single', 'post', 'tweet']);

const KIND_LABEL: Record<InjectType, string> = {
  'news-story-single': 'news article',
  tweet: 'social post',
  post: 'social post',
};

function systemPrompt(kind: string): string {
  return `A ${kind} was just imported into the user's knowledge-graph space as staged (unpublished) entities. Suggest 1–3 short next-step EDIT actions the user is likely to want — e.g. add a missing field, tag related people/topics, add a summary or cover image, link related entities, or review and publish. Each option must be ≤6 words, phrased as an action the assistant can perform when clicked. Don't suggest navigation, "learn more", or open questions.`;
}

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

const schema = jsonSchema<{ suggestions: string[] }>({
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      // Anthropic's structured-output schema rejects minItems/maxItems on
      // arrays; the 1–3 cap is enforced in code (slice) and via the description.
      description: 'A list of 1 to 3 short (≤6 words each) next-step edit actions for the just-imported entity.',
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
});

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return jsonError(403, 'Forbidden');
  }

  const cookieStore = await cookies();
  const wallet = parseWalletCookie(cookieStore.get(WALLET_ADDRESS)?.value);
  if (!wallet) {
    return jsonError(401, 'Sign in to use inject.');
  }

  const ip = getClientIp(req);
  try {
    const [identity, ipCeiling] = await Promise.all([loggedInLimit.limit(wallet), ipCeilingLimit.limit(ip)]);
    if (!identity.success || !ipCeiling.success) {
      const reset = Math.max(identity.success ? 0 : identity.reset, ipCeiling.success ? 0 : ipCeiling.reset);
      return rateLimitResponse(reset);
    }
  } catch (err) {
    console.error('[chat/inject-followups] rate limiter unavailable; failing closed', err);
    return jsonError(503, 'Service temporarily unavailable.');
  }

  let name: string;
  let type: InjectType;
  try {
    const body = await req.json();
    if (typeof body?.name !== 'string') return jsonError(400, 'Invalid name');
    if (typeof body?.type !== 'string' || !VALID_TYPES.has(body.type as InjectType)) {
      return jsonError(400, 'Invalid type');
    }
    name = body.name.trim().slice(0, MAX_NAME_CHARS);
    type = body.type as InjectType;
  } catch {
    return jsonError(400, 'Invalid request body');
  }

  try {
    const result = await generateObject({
      model: anthropic(FOLLOW_UPS_MODEL),
      system: systemPrompt(KIND_LABEL[type]),
      prompt: name ? `Imported entity: ${name}` : 'A new entity was imported.',
      schema,
      maxOutputTokens: 100,
    });
    logCallCost('inject-followups', FOLLOW_UPS_MODEL, result.usage);

    const suggestions = result.object.suggestions
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .slice(0, 3);

    return new Response(JSON.stringify({ suggestions }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[chat/inject-followups] generation failed', err);
    // Best-effort: an empty list just means no pills, no user-facing error.
    return new Response(JSON.stringify({ suggestions: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
