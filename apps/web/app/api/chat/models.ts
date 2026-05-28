// Sonnet for the stages that reason or extract from messy input (the executor,
// the research / web-fetch sub-agents); Haiku for the cheap stages that work off
// already-structured input (opener, closer, follow-ups) and lightweight utilities.
export const OPENER_MODEL = 'claude-haiku-4-5';
export const MAIN_MODEL = 'claude-sonnet-4-6';
export const CLOSER_MODEL = 'claude-haiku-4-5';

export const FOLLOW_UPS_MODEL = 'claude-haiku-4-5';

// research + web-fetch sub-agents — summarize/extract from web content.
export const RESEARCH_MODEL = 'claude-sonnet-4-6';

// Lightweight utility sub-agents: URL classification and image search.
export const UTILITY_MODEL = 'claude-haiku-4-5';
