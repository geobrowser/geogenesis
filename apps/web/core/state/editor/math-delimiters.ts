/** Regex (as string) for tiptap input/paste rules — handles \$ escaping.
 *
 * Structure:
 *   \$\$              — opening delimiter
 *   (?!\s*\$\$)       — reject empty / whitespace-only content
 *   (capture group)   — LaTeX content, alternation:
 *     [^$\\]          — any character that isn't $ or \
 *     \\.             — backslash + any character (handles \$, \\, etc.)
 *     \$(?!\$)        — a lone $ not followed by another $
 *   \$\$              — closing delimiter
 */
export const INLINE_MATH_REGEX = '\\$\\$(?!\\s*\\$\\$)((?:[^$\\\\]|\\\\.|\\$(?!\\$))*)\\$\\$';

export const MATH_DELIMITERS = {
  inlineStart: '$$',
  inlineEnd: '$$',
  inlineRegex: INLINE_MATH_REGEX,
};

/**
 * Check whether the character at `pos` in `src` is escaped by an odd
 * number of preceding backslashes (searching back no further than `minPos`).
 */
export function isEscaped(src: string, pos: number, minPos: number): boolean {
  let backslashes = 0;
  let k = pos - 1;
  while (k >= minPos && src.charCodeAt(k) === 0x5c /* \ */) {
    backslashes++;
    k--;
  }
  return backslashes % 2 === 1;
}
