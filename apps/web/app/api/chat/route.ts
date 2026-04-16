import { createAnthropic } from '@ai-sdk/anthropic';

import {
  type ModelMessage,
  type UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  jsonSchema,
  streamText,
  tool,
} from 'ai';
import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';

import { GUEST_SYSTEM_PROMPT, MEMBER_SYSTEM_PROMPT } from './chat-system-prompt';
import {
  anonBurstLimit,
  anonHourlyLimit,
  ipCeilingBurstLimit,
  ipCeilingHourlyLimit,
  loggedInBurstLimit,
  loggedInHourlyLimit,
} from './rate-limit';

const anthropic = createAnthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const CLAUDE_MODEL = 'claude-sonnet-4-6';

const MAX_HISTORY_CHARS = 50_000;
const MAX_LAST_MESSAGE_CHARS = 4_000;
const MAX_MESSAGES = 40;
const MAX_OUTPUT_TOKENS = 2_000;

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}

// The WALLET_ADDRESS cookie is client-set and unsigned, so a forged value could
// otherwise promote an anon caller to the member prompt and higher quotas.
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
    if (!Array.isArray((msg as { parts?: unknown }).parts)) return null;
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
      return rateLimitResponse(Math.max(burst.reset, hourly.reset, ipBurst.reset, ipHourly.reset));
    }
  } catch (err) {
    console.error('[chat] rate limiter unavailable', err);
    if (process.env.NODE_ENV === 'production') {
      return jsonError(503, 'Service temporarily unavailable. Please try again in a moment.');
    }
  }

  let uiMessages: UIMessage[];
  try {
    const body = await req.json();
    const validated = validateUIMessages(body?.messages);
    if (!validated) {
      return jsonError(400, 'Invalid request body');
    }
    uiMessages = validated;
  } catch {
    return jsonError(400, 'Invalid request body');
  }

  if (uiMessages.length > MAX_MESSAGES) {
    return jsonError(413, 'Conversation too long. Please start a new chat.');
  }

  if (lastUserMessageLength(uiMessages) > MAX_LAST_MESSAGE_CHARS) {
    return jsonError(413, 'Message is too long. Please shorten it and try again.');
  }

  if (JSON.stringify(uiMessages).length > MAX_HISTORY_CHARS) {
    return jsonError(413, 'Conversation too long. Please start a new chat.');
  }

  const converted = await convertToModelMessages(uiMessages);

  const messages: ModelMessage[] = [
    {
      role: 'system',
      content: isLoggedIn ? MEMBER_SYSTEM_PROMPT : GUEST_SYSTEM_PROMPT,
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    },
    ...converted,
  ];

  const tools = {
    suggestFollowUps: tool({
      description: 'Emit 1–4 short clickable follow-up options for the user.',
      inputSchema: jsonSchema<{ suggestions: string[] }>({
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 4,
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
  // text or skips the tool. Chain two streamText calls manually instead:
  // (1) stream the text reply with no tools, (2) re-send the full conversation
  // plus a synthetic "call the tool now" user turn and force suggestFollowUps.
  // Anthropic rejects requests that end on an assistant turn, hence the extra
  // user message.
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const textResult = streamText({
        model: anthropic(CLAUDE_MODEL),
        messages,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
      writer.merge(textResult.toUIMessageStream({ sendReasoning: false, sendFinish: false }));
      const assistantText = await textResult.text;

      const followUpResult = streamText({
        model: anthropic(CLAUDE_MODEL),
        messages: [
          ...messages,
          { role: 'assistant', content: assistantText },
          {
            role: 'user',
            content:
              'Now call suggestFollowUps with 1–4 short clickable next-step options relevant to your answer above.',
          },
        ],
        tools,
        toolChoice: { type: 'tool', toolName: 'suggestFollowUps' },
        maxOutputTokens: 200,
      });
      writer.merge(followUpResult.toUIMessageStream({ sendReasoning: false, sendStart: false }));
    },
    onError: err => {
      console.error('[chat] stream error', err);
      return 'An error occurred.';
    },
  });

  return createUIMessageStreamResponse({ stream });
}
