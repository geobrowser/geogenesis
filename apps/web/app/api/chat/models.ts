// Three-stage turn pipeline:
// 1. OPENER (Haiku) — fast 1-sentence acknowledgment, streams to client immediately.
// 2. MAIN (Sonnet) — reasoner. Runs the tool chain. No text output.
// 3. CLOSER (Haiku) — past-tense summary, reads Sonnet's tool results.
//
// Haiku is ~3-4× faster than Sonnet for short messages; using it on both ends
// keeps first-token and final-token latency low while Sonnet handles the
// reasoning where it matters (tool selection, multi-step chains, error recovery).
export const OPENER_MODEL = 'claude-haiku-4-5';
export const MAIN_MODEL = 'claude-sonnet-4-6';
export const CLOSER_MODEL = 'claude-haiku-4-5';

export const FOLLOW_UPS_MODEL = 'claude-haiku-4-5';

export const RESEARCH_MODEL = 'claude-haiku-4-5';
