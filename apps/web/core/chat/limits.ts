// Shared between API route and chat widget — safe to import on both sides.

// Shared so all chat-side callers import the entity-id shape from one place.
export const ENTITY_ID_REGEX = /^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export const MAX_PATH_CHARS = 200;

// The executor stage sends the full transcript + system prompt + tool results,
// so its input token count is what pushes against Sonnet's 200k context window.
// When the last turn's executor input crosses this, the widget fires
// /api/chat/compact in the background to summarize the history in place. Set
// well below 200k so there's headroom for the next user message, its tool
// results, and the model's output before we'd truly overflow.
export const COMPACT_AT_INPUT_TOKENS = 150_000;

// Where the context meter appears beside the composer, offering a manual
// summarize — half the automatic threshold, so the ring shows up at the
// halfway mark and fills from there. Below this a summary would throw away
// detail to solve a problem the user doesn't have yet, so the control stays
// hidden rather than sitting there inviting a pointless click.
export const OFFER_COMPACT_AT_INPUT_TOKENS = COMPACT_AT_INPUT_TOKENS / 2;

// Stream data part the route emits after the executor stage so the widget can
// decide whether to compact. Transient — never persisted into message history.
export const CONTEXT_USAGE_DATA_TYPE = 'context-usage';
export type ContextUsageData = { inputTokens: number };
