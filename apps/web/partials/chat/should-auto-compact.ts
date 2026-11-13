import { COMPACT_AT_INPUT_TOKENS } from '~/core/chat/limits';

export type AutoCompactState = {
  /** useChat's status. Only 'ready' is ever a candidate. */
  status: string;
  /** True across a turn's resubmit gaps, where `status` is briefly 'ready'. */
  isBusy: boolean;
  /** A compaction is already in flight. */
  isCompacting: boolean;
  /** How many messages the current chat holds. */
  messageCount: number;
  /** Last turn's executor input tokens, as reported by the route. */
  contextTokens: number;
  /** The reading that last failed, so one failure costs one attempt. */
  lastFailedAtTokens: number | null;
};

/**
 * Whether background compaction should start.
 *
 * Extracted from the widget because every one of these conditions exists to
 * stop a specific failure that has actually happened, and inline `if` guards in
 * a 1200-line component are not testable. Each `return false` below is a bug.
 */
export function shouldAutoCompact(state: AutoCompactState): boolean {
  // Mid-stream. Swapping the transcript here strands the rest of the turn.
  if (state.status !== 'ready') return false;
  // `status` returns to 'ready' between a turn's resubmits, so it alone does not
  // mean the turn finished.
  if (state.isBusy) return false;
  if (state.isCompacting) return false;
  // Nothing to summarize. A reading that outlives its transcript — a stale count
  // carried into a freshly opened chat — would otherwise POST an empty
  // conversation, which the endpoint rejects as an invalid body.
  if (state.messageCount === 0) return false;
  if (state.contextTokens < COMPACT_AT_INPUT_TOKENS) return false;
  // A failure leaves every input above untouched, so without this the retry is
  // immediate and endless — and the endpoint is rate-limited, so the loop earns
  // the 429 that keeps it spinning.
  if (state.lastFailedAtTokens === state.contextTokens) return false;
  return true;
}
