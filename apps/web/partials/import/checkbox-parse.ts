/**
 * Central list of truthy/falsy string pairs for parsing CSV checkbox (boolean) columns.
 * All comparisons are case-insensitive and trimmed.
 */

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'n', 'off']);

export type CheckboxParseResult =
  | { parsed: true; value: boolean }
  | { parsed: false };

/**
 * Attempt to parse a raw CSV string as a checkbox (boolean) value.
 * Returns `{ parsed: true, value }` for recognised truthy/falsy strings,
 * or `{ parsed: false }` when the value cannot be interpreted.
 */
export function parseCheckboxValue(raw: string): CheckboxParseResult {
  const normalized = raw.trim().toLowerCase();
  if (normalized === '') return { parsed: false };
  if (TRUE_VALUES.has(normalized)) return { parsed: true, value: true };
  if (FALSE_VALUES.has(normalized)) return { parsed: true, value: false };
  return { parsed: false };
}
