import { createAnthropic } from '@ai-sdk/anthropic';

import {
  type ModelMessage,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
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

import { activeAttachment, renderAttachmentNote } from './attachment-note';
import {
  type ChatClientContext,
  DEFAULT_GUEST_SYSTEM_PROMPT,
  DEFAULT_MEMBER_SYSTEM_PROMPT,
  INGESTION_SYSTEM_PROMPT,
  type PreloadedEntityForPrompt,
  renderCurrentContextSection,
  renderPreloadedEntitySection,
} from './chat-system-prompt';
import { type CostStage, formatTurnCost } from './cost';
import { buildFollowUpCapabilityNote } from './follow-up-capabilities';
import { withInterruptionNotes } from './interruption-note';
import { FOLLOW_UPS_MODEL, MAIN_MODEL } from './models';
import { anonLimit, ipCeilingLimit, loggedInLimit } from './rate-limit';
import { requestedItemCount } from './requested-item-count';
import { sanitizeModelMessages } from './sanitize-model-messages';
import {
  appendNoteToLastUserMessage,
  previousSpaceInConversation,
  renderCurrentSpaceNote,
  renderSpaceSwitchNote,
} from './space-switch-note';
import { buildNavTools } from './tools/nav';
import { memberReadTools, readTools } from './tools/read';
import { buildWriteContext, writeTools } from './tools/write';

const anthropic = createAnthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const MAX_OUTPUT_TOKENS = 8_000;
// High because rate limits + context window are the real ceiling; this just
// stops a runaway loop.
const MAX_TOOL_STEPS = 20;

const EXECUTOR_EMPTY_RETRY =
  'You produced no tool call and no text, so this turn currently has nothing in it and the user would have no answer. Answer the request now: call the tools it needs, or — if it genuinely needs none — write the answer as text.';

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

// Buffer tool-step prose in the UI stream while preserving the full model
// transcript. The same executor emits the final answer after tools complete.
function stripTextChunks(stream: ReadableStream<UIMessageChunk>): ReadableStream<UIMessageChunk> {
  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
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
    })
  );
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
  // Both run in the browser: the parsed file lives in a module-scoped Map
  // there and is never uploaded. applyImport is a write, but it is dispatched
  // by import-dispatcher rather than edit-dispatcher, so it is listed here —
  // this set is what makes the route wait for a client result instead of
  // ending the turn with the call unanswered.
  'proposeImportMapping',
  'applyImport',
  // Signs an on-chain membership proposal with the user's smart account, so it
  // runs in the browser too — and the turn must wait for its outcome, or the
  // answer would otherwise report a request that hasn't landed.
  'joinSpace',
]);

const MAX_LISTED_ITEMS = 25;

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

  const rawConverted = await convertToModelMessages(withInterruptionNotes(uiMessages));
  const { messages: sanitized, droppedToolCallIds } = sanitizeModelMessages(rawConverted);

  // Added after sanitizing so the notes can't be mistaken for orphaned tool
  // traffic. Two of them, answering different questions: where the user is
  // standing now (every turn — see `renderCurrentSpaceNote` for why it has no
  // trigger), and, when they moved, which space the numbers above describe.
  const previousSpaceId = previousSpaceInConversation(uiMessages, clientContext?.currentSpaceId ?? null);
  const spaceNotes = [
    clientContext?.currentSpaceId ? renderCurrentSpaceNote(clientContext.currentSpaceId) : null,
    previousSpaceId && clientContext?.currentSpaceId
      ? renderSpaceSwitchNote(clientContext.currentSpaceId, previousSpaceId)
      : null,
  ].filter((note): note is string => note !== null);
  const withSpaceNote =
    spaceNotes.length > 0 ? appendNoteToLastUserMessage(sanitized, spaceNotes.join('\n\n')) : sanitized;

  // Same mechanism, same reason: metadata is dropped by
  // `convertToModelMessages`, so a file the user attached is announced here —
  // on every turn until a tool has used it, since the conversation about a
  // file outlives the message it arrived on.
  const attachment = activeAttachment(uiMessages);
  const converted = attachment
    ? appendNoteToLastUserMessage(
        withSpaceNote,
        renderAttachmentNote(attachment.attachment, attachment.fromEarlierTurn)
      )
    : withSpaceNote;

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

  // An explicit requested count overrides the default concise list. The last
  // user message preserves it across client-tool continuations.
  const lastUserMessage = [...uiMessages].reverse().find(m => m.role === 'user');
  const requestedCount = requestedItemCount(
    (lastUserMessage?.parts ?? [])
      .filter(isTextUIPart)
      .map(part => part.text)
      .join(' ')
  );
  const listedCount = requestedCount === null ? null : Math.min(requestedCount, MAX_LISTED_ITEMS);
  if (listedCount !== null && messages[0].role === 'system') {
    messages[0].content += `\nThe user requested ${requestedCount} items. Return up to ${listedCount} actual results, each with its citation. If fewer are available, state the returned count and whether the results are complete. Never invent missing results or totals.`;
  }
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

  // Client tools resolve in the browser; continuation requests keep the same answer owner.
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
    // one per resubmit.
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

      // Track the executor’s peak per-step input token count —
      // the last steps carry the full transcript + tool results, so the peak is
      // the closest read on how full the context window is this turn.
      let peakExecInputTokens = 0;
      const runExecutor = (extraMessages: ModelMessage[] = []) =>
        streamText({
          model: anthropic(MAIN_MODEL),
          messages: extraMessages.length > 0 ? [...messages, ...extraMessages] : messages,
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

      const execResult = runExecutor();
      writer.merge(
        stripTextChunks(
          execResult.toUIMessageStream({
            sendReasoning: false,
            sendStart: true,
            sendFinish: false,
          })
        )
      );

      let execMessages = (await execResult.response).messages;
      let answerText = await execResult.text;
      await recordCost('executor', MAIN_MODEL, execResult);

      if (execMessages.length === 0) {
        if (debug) console.log('[chat] executor returned nothing — retrying once');
        const retryResult = runExecutor([{ role: 'user', content: EXECUTOR_EMPTY_RETRY }]);
        writer.merge(
          stripTextChunks(retryResult.toUIMessageStream({ sendReasoning: false, sendStart: false, sendFinish: false }))
        );
        execMessages = (await retryResult.response).messages;
        answerText = await retryResult.text;
        await recordCost('executor', MAIN_MODEL, retryResult);
      }

      // An empty retry is a failed model call, not evidence for an answer.
      if (execMessages.length === 0) {
        console.error('[chat:srv] executor produced nothing twice — ending turn with a failure notice');
        const noticeId = 'executor-empty';
        writer.write({ type: 'text-start', id: noticeId });
        writer.write({
          type: 'text-delta',
          id: noticeId,
          delta: "Something went wrong on my side and I couldn't work on that. Please try again.",
        });
        writer.write({ type: 'text-end', id: noticeId });
        logChainCost();
        return;
      }

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

      // The model that read the context and ran the tools owns the answer.
      // Buffer until client tools finish so a plan cannot be mistaken for success.
      if (answerText.trim()) {
        writer.write({ type: 'text-start', id: 'answer' });
        writer.write({ type: 'text-delta', id: 'answer', delta: answerText });
        writer.write({ type: 'text-end', id: 'answer' });
      } else {
        const answer = streamText({
          model: anthropic(MAIN_MODEL),
          messages: [
            ...messages,
            ...execMessages,
            {
              role: 'user',
              content:
                'The tool work above has finished. Write the final answer now, using its actual outcomes. If work failed or remains incomplete, say exactly what remains. Do not claim an edit without a successful result.',
            },
          ],
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          abortSignal: req.signal,
        });
        writer.merge(answer.toUIMessageStream({ sendReasoning: false, sendStart: false, sendFinish: false }));
        answerText = await answer.text;
        await recordCost('answer', MAIN_MODEL, answer);
      }

      // Stage D: follow-ups (Haiku, forced tool).
      const followUpInstruction = [
        buildFollowUpCapabilityNote(executorTools),
        'Call suggestFollowUps with 1–3 short next-step options grounded in the final answer and actual tool results. A tool call is only an attempt. Never imply edits were staged if a write returned an error or was never called. Do not suggest publishing or reviewing edits after a mapping preview. Preserve the user’s exclusions and confirmation requirements. If a request failed, suggest only a relevant recovery step.',
      ].join('\n\n');

      const followUpResult = streamText({
        model: anthropic(FOLLOW_UPS_MODEL),
        messages: [
          ...messages,
          ...execMessages,
          { role: 'assistant', content: answerText },
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
