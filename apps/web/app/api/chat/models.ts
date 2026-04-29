// Single source of truth for the Anthropic models used by the chat assistant.
// Upgrade by editing one line here — every callsite in `app/api/chat/` reads
// from these constants.

/**
 * Main reply stream. Handles tool calls (search, getEntity, edits, navigation,
 * etc.) and the closing-summary text. Needs strong reasoning + tool selection.
 */
export const MAIN_MODEL = 'claude-sonnet-4-6';

/**
 * Follow-up suggestions stream. Forced single-tool call producing 1–3 short
 * strings — Haiku is plenty capable here and ~3-4× faster end-to-end than
 * Sonnet, which closes the gap between the main reply finishing and the pills
 * landing in the UI.
 */
export const FOLLOW_UPS_MODEL = 'claude-haiku-4-5';
