import { createAnthropic } from '@ai-sdk/anthropic';

import {
  type ModelMessage,
  type StreamTextTransform,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isTextUIPart,
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
} from 'ai';
import { cookies } from 'next/headers';

import { EDIT_TOOL_NAMES } from '~/core/chat/edit-types';
import { CONTEXT_USAGE_DATA_TYPE, type ContextUsageData, ENTITY_ID_REGEX, MAX_PATH_CHARS } from '~/core/chat/limits';
import { WALLET_ADDRESS } from '~/core/cookie';

import {
  CLOSER_SYSTEM_PROMPT,
  type ChatClientContext,
  DEFAULT_GUEST_SYSTEM_PROMPT,
  DEFAULT_MEMBER_SYSTEM_PROMPT,
  INGESTION_SYSTEM_PROMPT,
  OPENER_SYSTEM_PROMPT,
  type PreloadedEntityForPrompt,
  renderCurrentContextSection,
  renderPreloadedEntitySection,
} from './chat-system-prompt';
import { type CostStage, formatTurnCost } from './cost';
import { buildFollowUpCapabilityNote } from './follow-up-capabilities';
import { CLOSER_MODEL, FOLLOW_UPS_MODEL, MAIN_MODEL, OPENER_MODEL } from './models';
import { anonLimit, ipCeilingLimit, loggedInLimit } from './rate-limit';
import { requestedItemCount } from './requested-item-count';
import { appendNoteToLastUserMessage, previousSpaceInConversation, renderSpaceSwitchNote } from './space-switch-note';
import { sanitizeModelMessages } from './sanitize-model-messages';
import { scopeToolTrafficToCurrentTurn } from './scope-tool-traffic';
import { buildNavTools } from './tools/nav';
import { memberReadTools, readTools } from './tools/read';
import { buildWriteContext, writeTools } from './tools/write';

const anthropic = createAnthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const MAX_OUTPUT_TOKENS = 8_000;
// High because rate limits + context window are the real ceiling; this just
// stops a runaway loop.
const MAX_TOOL_STEPS = 100;

// Best-effort, dev-only aggregation of per-stage cost across a resubmit chain.
// Module-local, so in serverless deploys chain requests can land on different
// instances and log separately. Not for correctness — debug logging only.
const chainCosts = new Map<string, CostStage[]>();
const MAX_TRACKED_CHAINS = 50;

// `req.signal` aborts surface as ResponseAborted / AbortError through every
// streamText.onError — that's the user pressing stop, not a real failure.
function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { name, code } = err as { name?: unknown; code?: unknown };
  if (name === 'AbortError' || name === 'ResponseAborted') return true;
  // Some runtimes surface aborts as DOMException with code 20.
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && code === 20) return true;
  return false;
}

const UUID_OR_DASHLESS = ENTITY_ID_REGEX;

// currentPath is interpolated into the system prompt inside backticks; reject
// anything that could break out of the code span or smuggle control chars.
const SAFE_PATHNAME = /^\/[^\s`\x00-\x1f\x7f]*$/;

// Preload must match validated currentContext or a stale entity could silently
// mislead the model.
function validatePreloadedEntity(
  input: unknown,
  expectedEntityId: string | null,
  expectedSpaceId: string | null
): PreloadedEntityForPrompt | null {
  if (input == null || typeof input !== 'object') return null;
  if (!expectedEntityId) return null;
  const raw = input as Record<string, unknown>;

  const entityId = raw.entityId;
  const spaceId = raw.spaceId;
  const data = raw.data;

  if (typeof entityId !== 'string' || !UUID_OR_DASHLESS.test(entityId)) return null;
  if (entityId.toLowerCase() !== expectedEntityId.toLowerCase()) return null;
  if (spaceId != null && (typeof spaceId !== 'string' || !UUID_OR_DASHLESS.test(spaceId))) return null;
  if (data == null || typeof data !== 'object') return null;

  if (expectedSpaceId && typeof spaceId === 'string' && spaceId.toLowerCase() !== expectedSpaceId.toLowerCase()) {
    return null;
  }

  return {
    entityId,
    spaceId: typeof spaceId === 'string' ? spaceId : null,
    data,
  };
}

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
  // personalSpaceId resolved server-side from membership; ignore client value.
  return {
    currentSpaceId: typeof currentSpaceId === 'string' ? currentSpaceId : null,
    currentEntityId: typeof currentEntityId === 'string' ? currentEntityId : null,
    currentPath: typeof currentPath === 'string' ? currentPath : null,
    isEditMode: typeof isEditMode === 'boolean' ? isEditMode : false,
  };
}

export type ChatMode = 'default' | 'ingestion';

function validateChatMode(input: unknown): ChatMode | null {
  if (input === undefined || input === null) return 'default';
  if (input === 'default' || input === 'ingestion') return input;
  return null;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  // No proxy headers (only hit in local dev); random key avoids a shared bucket.
  return `noip:${crypto.randomUUID()}`;
}

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

// Only consider limiters that actually rejected; taking max across all of them
// would surface a longer Retry-After from a window that didn't trip.
function failedLimiterReset(probes: LimitProbe[]): number {
  let max = 0;
  for (const probe of probes) {
    if (probe.success) continue;
    if (probe.reset > max) max = probe.reset;
  }
  return max;
}

// Strip text deltas from the executor's stream. Its text is still present in
// response.messages so the closer can read Sonnet's analysis, just not user-
// facing — the opener and closer own all visible text.
function suppressAllText<TOOLS extends ToolSet>(): StreamTextTransform<TOOLS> {
  return () =>
    new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(chunk, controller) {
        switch (chunk.type) {
          case 'text-start':
          case 'text-delta':
          case 'text-end':
            return;
          default:
            controller.enqueue(chunk);
        }
      },
    });
}

// The Haiku opener occasionally wraps its reasoning in <thinking>…</thinking>
// before the one-line ack, which would otherwise stream straight to the client.
// Strip those spans from the text stream. Tags can straddle delta boundaries, so
// we hold back any trailing run that could be the start of a tag and re-check it
// once more text arrives.
function stripThinkingTags<TOOLS extends ToolSet>(): StreamTextTransform<TOOLS> {
  const OPEN = '<thinking>';
  const CLOSE = '</thinking>';
  // Longest suffix of `s` that is a (proper) prefix of `tag`.
  const partialSuffixLen = (s: string, tag: string): number => {
    for (let n = Math.min(s.length, tag.length - 1); n > 0; n--) {
      if (tag.startsWith(s.slice(s.length - n))) return n;
    }
    return 0;
  };
  return () => {
    let pending = '';
    let hidden = false;
    let lastId: string | undefined;
    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(chunk, controller) {
        if (chunk.type !== 'text-delta') {
          controller.enqueue(chunk);
          return;
        }
        lastId = chunk.id;
        pending += chunk.text;
        let visible = '';
        for (;;) {
          if (!hidden) {
            const i = pending.indexOf(OPEN);
            if (i !== -1) {
              visible += pending.slice(0, i);
              pending = pending.slice(i + OPEN.length);
              hidden = true;
              continue;
            }
            const keep = partialSuffixLen(pending, OPEN);
            visible += pending.slice(0, pending.length - keep);
            pending = pending.slice(pending.length - keep);
            break;
          }
          const j = pending.indexOf(CLOSE);
          if (j !== -1) {
            pending = pending.slice(j + CLOSE.length);
            hidden = false;
            continue;
          }
          // Drop hidden text, but retain a trailing partial closing tag.
          pending = pending.slice(pending.length - partialSuffixLen(pending, CLOSE));
          break;
        }
        if (visible.length > 0) controller.enqueue({ ...chunk, text: visible });
      },
      flush(controller) {
        // Leftover text outside a thinking block is real output.
        if (!hidden && pending.length > 0 && lastId !== undefined) {
          controller.enqueue({ type: 'text-delta', id: lastId, text: pending } as TextStreamPart<TOOLS>);
        }
      },
    });
  };
}

const EDIT_TOOL_NAME_SET = new Set<string>(EDIT_TOOL_NAMES);
// Text-empty turns containing only these skip follow-up generation.
const NAV_LIKE_TOOL_NAMES = new Set<string>(['navigate', 'openReviewPanel']);
// Client-executed read tools; the server registers them schema-only.
const CLIENT_READ_TOOL_NAMES = new Set<string>([
  'searchGraph',
  'getEntity',
  'listSpaces',
  'research',
  'webFetch',
  'searchImages',
  'geoQuery',
]);

// The closer's reply budget. 400 covers the 1-3 sentences / 3-5 bullets its
// prompt asks for, and the 5-item list cap exists because a `geo://` pill costs
// roughly TOKENS_PER_LISTED_ITEM — two 32-char hex ids tokenize badly — so a
// longer list would be truncated mid-citation and render as broken markdown.
// Room for a longer list is bought per-turn against a count the user actually
// named, rather than by raising the ceiling on every ordinary turn.
const CLOSER_BASE_OUTPUT_TOKENS = 400;
const TOKENS_PER_LISTED_ITEM = 50;
// Ceiling on a named count, whatever was asked for. Beyond this the reply stops
// being a list and becomes a data dump: 25 items is already ~1,650 tokens and
// 12-15s of streaming, and the read tools cap out at 50 rows (`geoQuery`) and
// 10 (`searchGraph`), so a larger ask cannot be satisfied anyway. Over-asking is
// reported to the user rather than silently trimmed — see the closer's turn note.
const MAX_LISTED_ITEMS = 25;

function closerMaxOutputTokens(listedCount: number | null): number {
  if (listedCount === null) return CLOSER_BASE_OUTPUT_TOKENS;
  return CLOSER_BASE_OUTPUT_TOKENS + listedCount * TOKENS_PER_LISTED_ITEM;
}

// Edit/client tools resolve via resubmit, so the assistant turn that triggers
// 'edit' framing isn't always the one that emitted the call. Walk every
// message since the last user turn.
function classifyTurn(allMessages: ModelMessage[]): 'skip' | 'edit' | 'default' | 'client-pending' {
  let userIdx = -1;
  for (let i = allMessages.length - 1; i >= 0; i--) {
    if (allMessages[i].role === 'user') {
      userIdx = i;
      break;
    }
  }
  const turn = allMessages.slice(userIdx + 1);
  if (turn.length === 0) return 'default';

  // Pair tool-calls with tool-results so we know which client calls are pending.
  const callsByName = new Map<string, string>();
  const resultIds = new Set<string>();
  for (const message of turn) {
    if (message.role === 'tool' && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'tool-result' && part.toolCallId) resultIds.add(part.toolCallId);
      }
    } else if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'tool-call') callsByName.set(part.toolCallId, part.toolName);
      }
    }
  }

  let hasPendingClientCall = false;
  let hasEditCallInTurn = false;
  for (const [toolCallId, toolName] of callsByName) {
    if (CLIENT_READ_TOOL_NAMES.has(toolName) || EDIT_TOOL_NAME_SET.has(toolName)) {
      if (!resultIds.has(toolCallId)) hasPendingClientCall = true;
    }
    if (EDIT_TOOL_NAME_SET.has(toolName)) hasEditCallInTurn = true;
  }

  if (hasPendingClientCall) return 'client-pending';

  const lastAssistant = [...turn].reverse().find(m => m.role === 'assistant');
  let hasText = false;
  let onlyNavLike = true;
  if (lastAssistant) {
    const content = lastAssistant.content;
    if (typeof content === 'string') {
      if (content.trim().length > 0) hasText = true;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === 'text' && part.text.trim().length > 0) hasText = true;
        else if (part.type === 'tool-call' && !NAV_LIKE_TOOL_NAMES.has(part.toolName)) onlyNavLike = false;
      }
    }
  }

  if (hasEditCallInTurn) return 'edit';
  if (!hasText && onlyNavLike) return 'skip';
  return 'default';
}

// Reject any role other than user/assistant so a caller can't smuggle in a
// second `system` turn after the real prompt.
function validateUIMessages(input: unknown): UIMessage[] | null {
  if (!Array.isArray(input)) return null;
  for (const msg of input) {
    if (!msg || typeof msg !== 'object') return null;
    const role = (msg as { role?: unknown }).role;
    if (role !== 'user' && role !== 'assistant') return null;
    const parts = (msg as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) return null;
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
  const identityLimiter = isLoggedIn ? loggedInLimit : anonLimit;

  try {
    const [identity, ipCeiling] = await Promise.all([identityLimiter.limit(identityKey), ipCeilingLimit.limit(ip)]);

    if (!identity.success || !ipCeiling.success) {
      return rateLimitResponse(failedLimiterReset([identity, ipCeiling]));
    }
  } catch (err) {
    console.error('[chat] rate limiter unavailable; failing closed', err);
    return jsonError(503, 'Service temporarily unavailable. Please try again in a moment.');
  }

  let uiMessages: UIMessage[];
  let clientContext: ChatClientContext | null = null;
  let preloadedEntity: PreloadedEntityForPrompt | null = null;
  let chatMode: ChatMode = 'default';
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

    if (body?.preloadedEntity != null) {
      preloadedEntity = validatePreloadedEntity(
        body.preloadedEntity,
        clientContext?.currentEntityId ?? null,
        clientContext?.currentSpaceId ?? null
      );
    }

    if (body?.mode !== undefined) {
      const parsedMode = validateChatMode(body.mode);
      if (parsedMode === null) {
        return jsonError(400, 'Invalid request body');
      }
      chatMode = parsedMode;
    }
  } catch {
    return jsonError(400, 'Invalid request body');
  }

  const rawConverted = await convertToModelMessages(uiMessages);
  const { messages: sanitized, droppedToolCallIds } = sanitizeModelMessages(rawConverted);

  // Added after sanitizing so the note can't be mistaken for orphaned tool
  // traffic, and only when the conversation actually holds another space —
  // an unmoved conversation is byte-identical to before.
  const previousSpaceId = previousSpaceInConversation(uiMessages, clientContext?.currentSpaceId ?? null);
  const converted =
    previousSpaceId && clientContext?.currentSpaceId
      ? appendNoteToLastUserMessage(sanitized, renderSpaceSwitchNote(clientContext.currentSpaceId, previousSpaceId))
      : sanitized;

  if (droppedToolCallIds.length > 0) {
    console.warn(
      `[chat:srv] dropped ${droppedToolCallIds.length} tool-call/result blocks from converted history`,
      droppedToolCallIds.slice(0, 12)
    );
  }

  const writeContext = buildWriteContext({ walletAddress: wallet });

  // Both resolve from one cached membership lookup — the second await is free.
  const serverPersonalSpaceId = writeContext.kind === 'member' ? await writeContext.personalSpaceId() : null;
  const serverProfileEntityId = writeContext.kind === 'member' ? await writeContext.profileEntityId() : null;

  const basePrompt =
    chatMode === 'ingestion' && isLoggedIn
      ? INGESTION_SYSTEM_PROMPT
      : isLoggedIn
        ? DEFAULT_MEMBER_SYSTEM_PROMPT
        : DEFAULT_GUEST_SYSTEM_PROMPT;
  const contextSection = renderCurrentContextSection(clientContext, serverPersonalSpaceId, serverProfileEntityId);
  const preloadSection = renderPreloadedEntitySection(preloadedEntity);
  const systemContent = [basePrompt, contextSection, preloadSection].filter(Boolean).join('\n');

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
            description:
              'Short (≤6 words each) next-step options relevant to the response just given, each written in the user\'s voice as a command to the assistant ("Add a bio"), never in the assistant\'s own voice.',
          },
        },
        required: ['suggestions'],
        additionalProperties: false,
      }),
      execute: async ({ suggestions }: { suggestions: string[] }) => ({ suggestions }),
    }),
  };

  const navTools = buildNavTools(
    {
      resolvePersonalSpaceId: () =>
        writeContext.kind === 'member' ? writeContext.personalSpaceId() : Promise.resolve(null),
    },
    writeContext
  );
  // Members-only, schema-only here; dispatchers handle auth + execution.
  const memberWriteTools: ToolSet = isLoggedIn ? writeTools : {};
  const memberResearchTools: ToolSet = isLoggedIn ? memberReadTools : {};

  const executorTools: ToolSet = { ...readTools, ...navTools, ...memberWriteTools, ...memberResearchTools };

  // `debug` → one tight line per stage/step (default in dev).
  // `verbose` → also dump per-chunk and full message/state objects.
  const debug = process.env.NODE_ENV !== 'production' || process.env.CHAT_DEBUG === '1';
  const verbose = process.env.CHAT_VERBOSE === '1';
  const debugLog = (event: string, data?: unknown) => {
    if (!verbose) return;
    if (data === undefined) {
      console.log(`[chat:srv] ${event}`);
    } else {
      try {
        console.log(`[chat:srv] ${event}`, JSON.stringify(data, null, 2));
      } catch {
        console.log(`[chat:srv] ${event}`, data);
      }
    }
  };
  if (debug) {
    // The space is logged because a wrong-space answer is otherwise invisible
    // here: identifying which space a turn actually used meant counting
    // entities in the graph and matching the numbers by hand.
    const space = clientContext?.currentSpaceId ? `space=${clientContext.currentSpaceId.slice(0, 8)}` : 'space=none';
    const moved = previousSpaceId ? ` moved-from=${previousSpaceId.slice(0, 8)}` : '';
    console.log(
      `[chat] turn begin (${isLoggedIn ? 'member' : 'guest'}, ${uiMessages.length} msg${uiMessages.length === 1 ? '' : 's'}${chatMode === 'ingestion' ? ', ingestion' : ''}, ${space}${moved})`
    );
  }

  // Read from the user's own words, not from what the tools returned: a list of
  // 200 rows is still best summarised, but "give me 15" is an instruction the
  // closer's 5-item cap would otherwise overrule. Survives resubmits because
  // the triggering user message stays last until the turn ends.
  const lastUserMessage = [...uiMessages].reverse().find(m => m.role === 'user');
  const requestedCount = requestedItemCount(
    (lastUserMessage?.parts ?? [])
      .filter(isTextUIPart)
      .map(part => part.text)
      .join(' ')
  );
  const listedCount = requestedCount === null ? null : Math.min(requestedCount, MAX_LISTED_ITEMS);
  if (verbose) {
    const summary = converted.map((m, idx) => {
      let blocks: unknown;
      if (typeof m.content === 'string') {
        blocks = `text(${m.content.length})`;
      } else if (Array.isArray(m.content)) {
        blocks = m.content.map((c: { type?: unknown; toolCallId?: unknown; toolName?: unknown }) => {
          const t = typeof c.type === 'string' ? c.type : '?';
          const id = typeof c.toolCallId === 'string' ? c.toolCallId.slice(0, 24) : undefined;
          const name = typeof c.toolName === 'string' ? c.toolName : undefined;
          return name ? `${t}(${name}#${id ?? ''})` : t;
        });
      }
      return { idx, role: m.role, blocks };
    });
    debugLog('converted-messages', summary);
  }

  // Three-stage pipeline: Haiku opener → Sonnet executor (text-suppressed) →
  // Haiku closer. Closer is skipped on `skip` / `client-pending` so the SDK can
  // resubmit after a client dispatcher resolves pending tools.
  //
  // The SDK wraps tool-result blocks in a `user`-role message on continuation
  // requests, so a naive last-role check misfires. A trailing user message
  // with no tool-result block means this is a fresh user turn.
  const isFirstRequestOfTurn = ((): boolean => {
    for (let i = converted.length - 1; i >= 0; i--) {
      const m = converted[i];
      if (m.role === 'assistant') return false;
      if (m.role === 'user') {
        if (typeof m.content === 'string') return true;
        if (Array.isArray(m.content)) {
          const hasToolResult = m.content.some(part => (part as { type?: string }).type === 'tool-result');
          return !hasToolResult;
        }
      }
    }
    return true;
  })();

  const stream = createUIMessageStream({
    // Reuse the assistant message id on continuation requests so the SDK
    // merges new parts into the same UIMessage instead of rendering a fresh
    // one per resubmit (which duplicates the opener text).
    originalMessages: uiMessages,
    execute: async ({ writer }) => {
      const chainKey = wallet ?? ip;
      if (isFirstRequestOfTurn) {
        chainCosts.set(chainKey, []);
        if (chainCosts.size > MAX_TRACKED_CHAINS) {
          const oldest = chainCosts.keys().next().value;
          if (oldest !== undefined) chainCosts.delete(oldest);
        }
      } else if (!chainCosts.has(chainKey)) {
        chainCosts.set(chainKey, []);
      }
      const chainStages = chainCosts.get(chainKey)!;
      req.signal.addEventListener('abort', () => chainCosts.delete(chainKey), { once: true });

      const recordCost = async (
        stage: string,
        model: string,
        result: { totalUsage: PromiseLike<CostStage['usage']> }
      ) => {
        if (!debug) return;
        try {
          chainStages.push({ stage, model, usage: await result.totalUsage });
        } catch (err) {
          debugLog(`cost-usage-failed:${stage}`, String(err));
        }
      };
      const logChainCost = () => {
        if (debug && chainStages.length > 0) console.log(formatTurnCost(chainStages));
        chainCosts.delete(chainKey);
      };

      // Stage A: opener (Haiku). One-sentence ack; skipped on continuation.
      if (isFirstRequestOfTurn) {
        const openerResult = streamText({
          model: anthropic(OPENER_MODEL),
          // The opener writes the first line the user reads, off the raw
          // conversation. Without the current context its only clue to "this
          // space" is whatever was discussed earlier, so it would announce
          // "Scanning the Crypto space" to someone standing in the AI space —
          // the executor and closer then answered correctly, leaving the user
          // with a reply that contradicted its own opening line.
          system: [OPENER_SYSTEM_PROMPT, contextSection].filter(Boolean).join('\n\n'),
          messages: converted,
          maxOutputTokens: 80,
          experimental_transform: stripThinkingTags(),
          abortSignal: req.signal,
          onError: err => {
            if (!isAbortError(err)) console.error('[chat:srv] opener stream error', err);
          },
        });
        writer.merge(
          openerResult.toUIMessageStream({
            sendReasoning: false,
            sendFinish: false,
          })
        );
        // Drain before starting the executor so the executor's tool parts
        // don't interleave with the opener's text-end chunk.
        await openerResult.response;
        await recordCost('opener', OPENER_MODEL, openerResult);
      }

      // Stage B: executor (Sonnet). Track the peak per-step input token count —
      // the last steps carry the full transcript + tool results, so the peak is
      // the closest read on how full the context window is this turn.
      let peakExecInputTokens = 0;
      const execResult = streamText({
        model: anthropic(MAIN_MODEL),
        messages,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: req.signal,
        tools: executorTools,
        toolChoice: 'auto',
        // Serial tool use matches the prompt's "searchGraph first, then
        // research / writes" ordering and avoids client-tool resubmit races.
        providerOptions: {
          anthropic: { disableParallelToolUse: true },
        },
        stopWhen: stepCountIs(MAX_TOOL_STEPS),
        experimental_transform: suppressAllText(),
        onChunk: verbose
          ? ({ chunk }) => {
              const summary: Record<string, unknown> = { type: chunk.type };
              if ('toolName' in chunk) summary.toolName = chunk.toolName;
              if ('toolCallId' in chunk) summary.toolCallId = chunk.toolCallId;
              if ('providerExecuted' in chunk) summary.providerExecuted = chunk.providerExecuted;
              if ('dynamic' in chunk) summary.dynamic = chunk.dynamic;
              debugLog('chunk', summary);
            }
          : undefined,
        onStepFinish: step => {
          const stepInput = step.usage?.inputTokens ?? 0;
          if (stepInput > peakExecInputTokens) peakExecInputTokens = stepInput;
          if (debug) {
            const tools =
              step.toolCalls
                ?.map(tc => tc.toolName)
                .filter(Boolean)
                .join(', ') ?? '';
            const text = (step.text?.length ?? 0) > 0 ? ' +text' : '';
            console.log(`[chat] step ${tools || '(no-tool)'}${text} → ${step.finishReason}`);
          }
        },
        onError: err => {
          if (!isAbortError(err)) console.error('[chat:srv] executor stream error', err);
        },
      });
      writer.merge(
        execResult.toUIMessageStream({
          sendReasoning: false,
          // Opener already emitted message-start; don't duplicate it.
          sendStart: !isFirstRequestOfTurn,
          sendFinish: false,
        })
      );

      const execMessages = (await execResult.response).messages;
      await recordCost('executor', MAIN_MODEL, execResult);

      // Surface context occupancy so the widget can compact when we near the
      // window. Transient: informs the client, never lands in message history.
      if (peakExecInputTokens > 0) {
        writer.write({
          type: `data-${CONTEXT_USAGE_DATA_TYPE}`,
          data: { inputTokens: peakExecInputTokens } satisfies ContextUsageData,
          transient: true,
        });
      }

      const turnKind = classifyTurn([...messages, ...execMessages]);
      if (debug) {
        console.log(
          `[chat] executor done (turnKind=${turnKind}, ${execMessages.length} msg${execMessages.length === 1 ? '' : 's'})`
        );
      }
      if (verbose) {
        debugLog('executor-finished', {
          turnKind,
          execMessages: execMessages.map(m => ({
            role: m.role,
            contentTypes: Array.isArray(m.content)
              ? m.content.map(c => (typeof c === 'string' ? 'string' : c.type))
              : typeof m.content,
          })),
        });
      }

      if (turnKind === 'client-pending') {
        // More requests coming in this chain — don't log yet.
        return;
      }

      // Stage C: closer (Haiku). Writes the user-facing summary from the
      // executor's tool calls + results.
      //
      // Every turn gets a reply, including a nav-only one. Suppressing the
      // closer on `skip` assumed navigating is its own feedback, which holds
      // when the user asked to go somewhere and breaks badly when the executor
      // chose to navigate in response to something else ("complete my profile"
      // → navigate → silence). A one-sentence Haiku ack costs a fraction of a
      // cent and removes the possibility of a turn that answers nothing.
      const closerResult = streamText({
        model: anthropic(CLOSER_MODEL),
        // Same Current context the executor gets. The closer writes the visible
        // reply, so it is the model that has to know what "this space" means —
        // without it, it cannot scope an answer to where the user is standing.
        system: [
          CLOSER_SYSTEM_PROMPT,
          contextSection,
          turnKind === 'skip'
            ? "# This turn\nThe only thing that happened was navigation. Say where you took the user, in one sentence, and stop. Do not describe the destination's contents — you haven't read them."
            : null,
          requestedCount === null || listedCount === null
            ? null
            : `# This turn\nThe user asked for ${requestedCount} items, so the 5-item list cap does NOT apply — list up to ${listedCount}, each cited as a \`geo://\` pill, and you have been given the output budget for it.${
                requestedCount > listedCount
                  ? ` They asked for more than can be shown, so open with "Showing ${listedCount} of the ${requestedCount} you asked for" (or the same point in your own words) — never present ${listedCount} as though it were all of them.`
                  : ''
              } If the tool results contain fewer than that, list every one you have and say plainly how many there are; do not pad the list and do not close with "…and N more" when nothing remains.`,
        ]
          .filter(Boolean)
          .join('\n\n'),
        messages: scopeToolTrafficToCurrentTurn([...converted, ...execMessages]),
        maxOutputTokens: closerMaxOutputTokens(listedCount),
        abortSignal: req.signal,
        onError: err => {
          if (!isAbortError(err)) console.error('[chat:srv] closer stream error', err);
        },
      });
      writer.merge(
        closerResult.toUIMessageStream({
          sendReasoning: false,
          sendStart: false,
          sendFinish: false,
        })
      );

      const closerMessages = (await closerResult.response).messages;
      await recordCost('closer', CLOSER_MODEL, closerResult);

      // Stage D: follow-ups (Haiku, forced tool).
      const followUpInstruction = [
        buildFollowUpCapabilityNote(executorTools),
        turnKind === 'edit'
          ? "You just edited the graph on the user's behalf. Call suggestFollowUps with 1–3 short options for further edits they're likely to want next — more fields to fill, related blocks to add, filters to tune, or removing what you just added. Don't suggest navigation, \"learn more\", or open questions."
          : 'Now call suggestFollowUps with 1–3 short clickable next-step options relevant to your answer above.',
      ].join('\n\n');

      const followUpResult = streamText({
        model: anthropic(FOLLOW_UPS_MODEL),
        messages: [
          ...messages,
          ...execMessages,
          ...closerMessages,
          {
            role: 'user',
            content: followUpInstruction,
          },
        ],
        tools: followUpTools,
        toolChoice: { type: 'tool', toolName: 'suggestFollowUps' },
        maxOutputTokens: 100,
        abortSignal: req.signal,
      });
      writer.merge(followUpResult.toUIMessageStream({ sendReasoning: false, sendStart: false }));
      await recordCost('follow-ups', FOLLOW_UPS_MODEL, followUpResult);
      logChainCost();
    },
    onError: err => {
      if (isAbortError(err)) return 'cancelled';
      console.error('[chat] stream error', err);
      // Coarse classification so the client can show a sharper message.
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
