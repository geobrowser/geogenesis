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

// Tool calls consume output tokens; a chained edit turn can exceed 2k. 6k leaves headroom.
const MAX_OUTPUT_TOKENS = 6_000;
const MAX_TOOL_STEPS = 6;

const UUID_OR_DASHLESS = ENTITY_ID_REGEX;

// currentPath is interpolated into the system prompt inside backticks; reject
// anything that could break out of the code span or smuggle control chars.
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
  // personalSpaceId is ignored here; resolved server-side from membership so a
  // forged context can't redirect navigation.

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
  // No proxy headers — random key per request avoids false-positive 429s from
  // a shared `unknown` bucket. Vercel always sets x-forwarded-for so this is
  // unreachable in prod.
  return `noip:${crypto.randomUUID()}`;
}

// httpOnly + sameSite=lax means script can't forge this cookie, but we still
// validate shape to fall back to the guest prompt on a malformed value.
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
// Navigation turns: text-empty turns containing only these skip follow-up generation.
const NAV_LIKE_TOOL_NAMES = new Set<string>(['navigate', 'openReviewPanel']);

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

// Reject any role other than user/assistant so a caller can't smuggle a
// second `system` turn in after the real prompt.
function validateUIMessages(input: unknown): UIMessage[] | null {
  if (!Array.isArray(input)) return null;
  for (const msg of input) {
    if (!msg || typeof msg !== 'object') return null;
    const role = (msg as { role?: unknown }).role;
    if (role !== 'user' && role !== 'assistant') return null;
    const parts = (msg as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) return null;
    // Shallow check: null or shape-bogus parts would crash convertToModelMessages.
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
  // respond to, so a single streamText with forced toolChoice either skips
  // the text or skips the tool. Chain two streamTexts manually: (1) text
  // reply, then (2) forced suggestFollowUps that sees the completed turn.
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

      const firstStreamMessages = (await textResult.response).messages;

      const turnKind = classifyTurn(firstStreamMessages);

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
        // 100 tokens is plenty for 3 short strings; lower cap = faster finish.
        maxOutputTokens: 100,
      });
      writer.merge(followUpResult.toUIMessageStream({ sendReasoning: false, sendStart: false }));
    },
    onError: err => {
      console.error('[chat] stream error', err);
      // Coarse classification lets the client show a sharper error message.
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
