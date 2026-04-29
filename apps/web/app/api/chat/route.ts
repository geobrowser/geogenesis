import { createAnthropic } from '@ai-sdk/anthropic';

import {
  type ModelMessage,
  type ToolSet,
  type UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
} from 'ai';
import { cookies } from 'next/headers';

import { EDIT_TOOL_NAMES } from '~/core/chat/edit-types';
import {
  ENTITY_ID_REGEX,
  HISTORY_FULL_MESSAGE,
  MAX_HISTORY_CHARS,
  MAX_LAST_MESSAGE_CHARS,
  MAX_MESSAGES,
  MAX_PATH_CHARS,
  MESSAGE_TOO_LONG_MESSAGE,
} from '~/core/chat/limits';
import { WALLET_ADDRESS } from '~/core/cookie';

import {
  type ChatClientContext,
  GUEST_SYSTEM_PROMPT,
  MEMBER_SYSTEM_PROMPT,
  renderCurrentContextSection,
} from './chat-system-prompt';
import { FOLLOW_UPS_MODEL, MAIN_MODEL } from './models';
import {
  anonBurstLimit,
  anonHourlyLimit,
  ipCeilingBurstLimit,
  ipCeilingHourlyLimit,
  loggedInBurstLimit,
  loggedInHourlyLimit,
} from './rate-limit';
import { buildNavTools } from './tools/nav';
import { readTools } from './tools/read';
import { buildWriteContext, buildWriteTools } from './tools/write';

const anthropic = createAnthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// Tool-call JSON eats output tokens too. A chained edit turn (resolve types
// + searchGraph + createBlock + setDataBlockFilters + setDataBlockView +
// closing summary) can run past 2k. 6k leaves headroom without exposing more
// of an attack surface than the existing per-IP rate limits do.
const MAX_OUTPUT_TOKENS = 6_000;
const MAX_TOOL_STEPS = 6;

const UUID_OR_DASHLESS = ENTITY_ID_REGEX;

// currentPath is interpolated into the system prompt inside backticks, so
// reject anything that could break out of the code span or smuggle newlines
// / control chars into the prompt. Must start with '/' and contain no
// whitespace, backticks, or control characters.
const SAFE_PATHNAME = /^\/[^\s`\x00-\x1f\x7f]*$/;

function validateClientContext(input: unknown): ChatClientContext | null {
  if (input == null || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;

  const currentSpaceId = raw.currentSpaceId;
  const currentEntityId = raw.currentEntityId;
  const currentPath = raw.currentPath;
  const isEditMode = raw.isEditMode;

  if (currentSpaceId != null && (typeof currentSpaceId !== 'string' || !UUID_OR_DASHLESS.test(currentSpaceId))) {
    return null;
  }
  if (currentEntityId != null && (typeof currentEntityId !== 'string' || !UUID_OR_DASHLESS.test(currentEntityId))) {
    return null;
  }
  if (
    currentPath != null &&
    (typeof currentPath !== 'string' || currentPath.length > MAX_PATH_CHARS || !SAFE_PATHNAME.test(currentPath))
  ) {
    return null;
  }
  if (isEditMode != null && typeof isEditMode !== 'boolean') {
    return null;
  }
  // Note: any `personalSpaceId` the client sends is ignored. The route resolves
  // the real personal space from the wallet's membership graph (via
  // writeContext) so a forged client context can't redirect navigation.

  return {
    currentSpaceId: typeof currentSpaceId === 'string' ? currentSpaceId : null,
    currentEntityId: typeof currentEntityId === 'string' ? currentEntityId : null,
    currentPath: typeof currentPath === 'string' ? currentPath : null,
    isEditMode: typeof isEditMode === 'boolean' ? isEditMode : false,
  };
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  // No proxy headers — rather than dropping every anonymous-IP request into a
  // single shared `unknown` bucket (which causes false-positive 429s for any
  // legitimate user behind the same edge), emit a per-request random key so
  // rate limiting degrades open. The IP-ceiling axes still cap volume from a
  // single TCP source upstream.
  return `noip:${crypto.randomUUID()}`;
}

// The WALLET_ADDRESS cookie is httpOnly + sameSite=lax, so script can't forge
// or rotate it from the page; we still validate the shape here as a belt-and-
// suspenders check (and to fall back to the guest prompt on a malformed
// value).
function parseWalletCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(lower) ? lower : null;
}

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');

  if (!origin) {
    return process.env.NODE_ENV !== 'production';
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function jsonError(status: number, message: string, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

function rateLimitResponse(reset: number) {
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return jsonError(429, 'Rate limit exceeded. Please slow down and try again shortly.', {
    'Retry-After': retryAfter.toString(),
  });
}

type LimitProbe = { success: boolean; reset: number };

// Take `reset` only from the limiters that actually rejected — taking max
// across all four would let an exhausted 10-second burst surface a 1-hour
// Retry-After if the hourly window happens to reset later.
function failedLimiterReset(probes: LimitProbe[]): number {
  let max = 0;
  for (const probe of probes) {
    if (probe.success) continue;
    if (probe.reset > max) max = probe.reset;
  }
  return max;
}

const EDIT_TOOL_NAME_SET = new Set<string>(EDIT_TOOL_NAMES);
// Tools that change what the user sees without staging a graph edit. A turn
// that's text-empty and only consists of these should skip follow-ups — the
// UI has just changed, so the clickable pills wouldn't be visible anyway.
const NAV_LIKE_TOOL_NAMES = new Set<string>(['navigate', 'openReviewPanel']);

// Classify the assistant's last turn to pick follow-up framing.
//  - `skip`: text-empty, nav-like-only — no substantive content to anchor to.
//  - `edit`: included at least one write tool call; follow-ups should suggest
//    further edits (more fields, related blocks, filter tweaks).
//  - `default`: read / mixed turn; use the generic next-step framing.
function classifyTurn(firstStreamMessages: ModelMessage[]): 'skip' | 'edit' | 'default' {
  const lastAssistant = [...firstStreamMessages].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant) return 'default';
  const content = lastAssistant.content;
  if (typeof content === 'string') return content.trim().length === 0 ? 'skip' : 'default';
  if (!Array.isArray(content)) return 'default';

  let hasText = false;
  let onlyNavLike = true;
  let hasEditCall = false;
  for (const part of content) {
    if (part.type === 'text' && part.text.trim().length > 0) {
      hasText = true;
    } else if (part.type === 'tool-call') {
      if (!NAV_LIKE_TOOL_NAMES.has(part.toolName)) onlyNavLike = false;
      if (EDIT_TOOL_NAME_SET.has(part.toolName)) hasEditCall = true;
    }
  }
  if (hasEditCall) return 'edit';
  if (!hasText && onlyNavLike) return 'skip';
  return 'default';
}

function lastUserMessageLength(uiMessages: UIMessage[]): number {
  for (let i = uiMessages.length - 1; i >= 0; i--) {
    if (uiMessages[i]?.role === 'user') {
      return JSON.stringify(uiMessages[i]).length;
    }
  }
  return 0;
}

// The client sends the full UIMessage[] on every request. We trust nothing in
// the payload — in particular, we reject any role other than user/assistant so
// a caller can't smuggle a second `system` turn in after our real prompt.
function validateUIMessages(input: unknown): UIMessage[] | null {
  if (!Array.isArray(input)) return null;
  for (const msg of input) {
    if (!msg || typeof msg !== 'object') return null;
    const role = (msg as { role?: unknown }).role;
    if (role !== 'user' && role !== 'assistant') return null;
    const parts = (msg as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) return null;
    // Shallow per-item check: each part must at least be an object with a
    // string `type`. A null or shape-bogus part would otherwise crash inside
    // convertToModelMessages further down.
    for (const part of parts) {
      if (!part || typeof part !== 'object') return null;
      if (typeof (part as { type?: unknown }).type !== 'string') return null;
    }
  }
  return input as UIMessage[];
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return jsonError(403, 'Forbidden');
  }

  const cookieStore = await cookies();
  const wallet = parseWalletCookie(cookieStore.get(WALLET_ADDRESS)?.value);

  const isLoggedIn = wallet !== null;
  const ip = getClientIp(req);
  const identityKey = wallet ?? ip;
  const identityBurst = isLoggedIn ? loggedInBurstLimit : anonBurstLimit;
  const identityHourly = isLoggedIn ? loggedInHourlyLimit : anonHourlyLimit;

  try {
    const [burst, hourly, ipBurst, ipHourly] = await Promise.all([
      identityBurst.limit(identityKey),
      identityHourly.limit(identityKey),
      ipCeilingBurstLimit.limit(ip),
      ipCeilingHourlyLimit.limit(ip),
    ]);

    if (!burst.success || !hourly.success || !ipBurst.success || !ipHourly.success) {
      return rateLimitResponse(failedLimiterReset([burst, hourly, ipBurst, ipHourly]));
    }
  } catch (err) {
    console.error('[chat] rate limiter unavailable', err);
    if (process.env.NODE_ENV === 'production') {
      return jsonError(503, 'Service temporarily unavailable. Please try again in a moment.');
    }
  }

  let uiMessages: UIMessage[];
  let clientContext: ChatClientContext | null = null;
  try {
    const body = await req.json();
    const validated = validateUIMessages(body?.messages);
    if (!validated) {
      return jsonError(400, 'Invalid request body');
    }
    uiMessages = validated;

    if (body?.context !== undefined) {
      const parsedContext = validateClientContext(body.context);
      if (parsedContext === null && body.context !== null) {
        return jsonError(400, 'Invalid request body');
      }
      clientContext = parsedContext;
    }
  } catch {
    return jsonError(400, 'Invalid request body');
  }

  if (uiMessages.length > MAX_MESSAGES) {
    return jsonError(413, HISTORY_FULL_MESSAGE);
  }

  if (lastUserMessageLength(uiMessages) > MAX_LAST_MESSAGE_CHARS) {
    return jsonError(413, MESSAGE_TOO_LONG_MESSAGE);
  }

  if (JSON.stringify(uiMessages).length > MAX_HISTORY_CHARS) {
    return jsonError(413, HISTORY_FULL_MESSAGE);
  }

  const converted = await convertToModelMessages(uiMessages);

  const writeContext = buildWriteContext({ walletAddress: wallet });

  // Resolve the personal-space id from the wallet's actual graph state — the
  // client's claim about it is ignored. The lookup is memoized on writeContext
  // so reading it for the prompt and reading it inside `navigate` share the
  // same round trip.
  const serverPersonalSpaceId = writeContext.kind === 'member' ? await writeContext.personalSpaceId() : null;

  const basePrompt = isLoggedIn ? MEMBER_SYSTEM_PROMPT : GUEST_SYSTEM_PROMPT;
  const contextSection = renderCurrentContextSection(clientContext, serverPersonalSpaceId);
  const systemContent = contextSection ? `${basePrompt}\n${contextSection}` : basePrompt;

  const messages: ModelMessage[] = [
    {
      role: 'system',
      content: systemContent,
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    },
    ...converted,
  ];

  const followUpTools = {
    suggestFollowUps: tool({
      description: 'Emit 1–3 short clickable follow-up options for the user.',
      inputSchema: jsonSchema<{ suggestions: string[] }>({
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 3,
            description: 'Short (≤6 words each) next-step options relevant to the response just given.',
          },
        },
        required: ['suggestions'],
        additionalProperties: false,
      }),
      execute: async ({ suggestions }: { suggestions: string[] }) => ({ suggestions }),
    }),
  };

  // The AI SDK's multi-step loop only continues when a step has tool calls to
  // respond to, so a single streamText with forced toolChoice either skips the
  // text or skips the tool. Chain two streamTexts manually instead:
  // (1) text reply with any tools registered
  // (2) suggestFollowUps with toolChoice forced — runs SEQUENTIALLY after the
  //     first stream so it can see the assistant's just-completed turn (text +
  //     tool calls + tool results) and produce suggestions that actually match
  //     what was shown. The client renders skeleton pills during the gap so
  //     the wait doesn't feel like dead time, and Haiku keeps the gap short.
  const navTools = buildNavTools(
    {
      resolvePersonalSpaceId: () =>
        writeContext.kind === 'member' ? writeContext.personalSpaceId() : Promise.resolve(null),
    },
    writeContext
  );
  const writeTools: ToolSet = isLoggedIn ? buildWriteTools(writeContext) : {};

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const textResult = streamText({
        model: anthropic(MAIN_MODEL),
        messages,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        tools: { ...readTools, ...navTools, ...writeTools },
        toolChoice: 'auto',
        stopWhen: stepCountIs(MAX_TOOL_STEPS),
      });
      writer.merge(textResult.toUIMessageStream({ sendReasoning: false, sendFinish: false }));

      // Forward the full assistant turn — text plus any tool-use / tool-result
      // parts — into the follow-up stream so suggestions can reference what was
      // actually shown instead of the user's question alone.
      const firstStreamMessages = (await textResult.response).messages;

      const turnKind = classifyTurn(firstStreamMessages);

      // Skip the follow-up call entirely when the assistant only routed the
      // user elsewhere — "where to go next" suggestions aren't useful on a
      // navigation turn, and it saves a round trip.
      if (turnKind === 'skip') {
        return;
      }

      const followUpInstruction =
        turnKind === 'edit'
          ? "You just edited the graph on the user's behalf. Call suggestFollowUps with 1–3 short options for further edits they're likely to want next — more fields to fill, related blocks to add, filters to tune, or an undo. Don't suggest navigation, \"learn more\", or open questions."
          : 'Now call suggestFollowUps with 1–3 short clickable next-step options relevant to your answer above.';

      const followUpResult = streamText({
        model: anthropic(FOLLOW_UPS_MODEL),
        messages: [
          ...messages,
          ...firstStreamMessages,
          {
            role: 'user',
            content: followUpInstruction,
          },
        ],
        tools: followUpTools,
        toolChoice: { type: 'tool', toolName: 'suggestFollowUps' },
        // Output is just `{ suggestions: [s1, s2, s3] }` with each string ≤6
        // words. 100 tokens is more than enough; lower cap = faster finish.
        maxOutputTokens: 100,
      });
      writer.merge(followUpResult.toUIMessageStream({ sendReasoning: false, sendStart: false }));
    },
    onError: err => {
      console.error('[chat] stream error', err);
      // Surface a coarse classification so the client can show a sharper
      // message (rate-limited / overloaded / transport / generic). Returned
      // string ends up as a stream-error event the UI parses.
      const message = err instanceof Error ? err.message : '';
      if (message.toLowerCase().includes('rate')) return 'rate_limited';
      if (message.toLowerCase().includes('overload') || message.toLowerCase().includes('timeout')) {
        return 'transient';
      }
      return 'unknown_stream_error';
    },
  });

  return createUIMessageStreamResponse({ stream });
}
