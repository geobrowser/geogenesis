import { capture } from './analytics';

/**
 * `capture` for code where analytics must never get in the way: a lobby, a debate, a live call.
 * Anything it throws is dropped. Separate from `analytics.ts` so suites that mock that module's
 * `capture` still reach their mock through this.
 */
export function captureSafely(...args: Parameters<typeof capture>) {
  try {
    capture(...args);
  } catch {
    // Dropped.
  }
}
