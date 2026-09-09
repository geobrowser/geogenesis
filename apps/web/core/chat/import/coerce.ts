/**
 * Turning a spreadsheet cell into the string a Geo property expects.
 *
 * This exists because the raw cell reaches `convertToGrc20Value` untouched
 * today, and that function is unforgiving:
 *
 *   case 'INTEGER': value: parseInt(val, 10) || 0
 *
 * `parseInt` stops at the first non-digit and `|| 0` swallows the failure, so
 * `2,015` publishes as `2`, `March 2015` and `N/A` both publish as `0`, and
 * nobody finds out — a wrong number on-chain is indistinguishable from a right
 * one. `DECIMAL` is worse: it runs `BigInt()`, which throws, so a single
 * unparseable cell fails the entire publish.
 *
 * Two rules follow from that:
 *
 * 1. Convert rather than report. A curator has no reason to know Geo stores
 *    "Founding year" as an integer, so we do the work instead of asking them
 *    to fix their file.
 * 2. Missing data must produce *no value at all* — never a sentinel. `0` is
 *    what the current code writes for `N/A`, and it is the bug, not the fix.
 *
 * The model picks a rule per column from the closed set below; this module
 * applies that rule to every row. Nothing here calls a model — deciding is a
 * judgement made once, converting is a loop run thousands of times.
 */
import { parseCheckboxValue } from '~/partials/import/checkbox-parse';

export const COERCION_RULES = [
  'text',
  'integer',
  'integer:year',
  'float',
  'decimal',
  'boolean',
  'date',
  'date:dmy',
  'date:mdy',
  'datetime',
  'time',
] as const;

export type CoercionRule = (typeof COERCION_RULES)[number];

export function isCoercionRule(value: unknown): value is CoercionRule {
  return typeof value === 'string' && (COERCION_RULES as readonly string[]).includes(value);
}

export type CoercionResult =
  | { ok: true; value: string }
  /** The cell said "no data". Expected, silent, not worth reporting per-row. */
  | { ok: false; reason: 'placeholder' }
  /** The cell held something we could not read as this type. Counted and mentioned. */
  | { ok: false; reason: 'unconvertible' };

const SKIP_PLACEHOLDER: CoercionResult = { ok: false, reason: 'placeholder' };
const SKIP_UNCONVERTIBLE: CoercionResult = { ok: false, reason: 'unconvertible' };

/**
 * Strings that mean "nothing here".
 *
 * Deliberately a fixed list rather than a pattern: anything looser starts
 * eating real values. A company called "None" is unlikely, but a `Notes` column
 * containing the word is not, so the list stays to spellings that only ever
 * appear as filler.
 */
const PLACEHOLDERS = new Set([
  '',
  '-',
  '--',
  '—',
  '–',
  'n/a',
  'n.a.',
  'na',
  '#n/a',
  'null',
  'nil',
  'none',
  'unknown',
  'unspecified',
  'not available',
  'not applicable',
  'tbd',
  'tba',
  '?',
  '??',
]);

export function isPlaceholder(raw: string): boolean {
  return PLACEHOLDERS.has(raw.trim().toLowerCase());
}

/**
 * Read a human-written number.
 *
 * Handles what spreadsheets actually contain: thousands separators, currency
 * symbols, accounting negatives, percent signs, and exponents. The hard part is
 * that `1,234` is one thousand two hundred in English and one-point-something
 * in German, and the same file can't tell you which — so the separators are
 * resolved positionally rather than by locale.
 */
export function parseNumericString(raw: string): number | null {
  let text = raw.trim();
  if (text === '') return null;

  // Accounting negatives: (1,234) means -1234.
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  // Currency symbols, percent, and spaces used as thousands separators
  // (French/Swedish convention, including the non-breaking kind).
  text = text.replace(/[$£€¥₹%]/g, '').replace(/[\s  ']/g, '');

  if (text.startsWith('+')) text = text.slice(1);
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  }

  if (text === '') return null;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: whichever comes last is the decimal point, the other is
    // grouping. Covers `1,234.56` and `1.234,56` without guessing a locale.
    if (lastComma > lastDot) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    // Only commas. Groups of exactly three, or more than one comma, means
    // grouping — `2,015` is two thousand and fifteen, which is the documented
    // case `parseInt` currently turns into `2`.
    const parts = text.split(',');
    const grouping = parts.length > 2 || /^\d{3}$/.test(parts[parts.length - 1]);
    text = grouping ? text.replace(/,/g, '') : text.replace(',', '.');
  }
  // Only dots, or neither: already in a shape `Number()` understands.

  if (!/^\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(text)) return null;

  const value = Number(text);
  if (!Number.isFinite(value)) return null;

  return negative ? -value : value;
}

/**
 * Integers are stored as strings, so a float has to be rendered without an
 * exponent — `String(1.5e21)` is `"1.5e+21"`, which `parseInt` reads as `1`.
 */
function toIntegerString(value: number): string | null {
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded)) return null;
  return String(rounded);
}

function toDecimalString(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  // `toFixed(20)` then trim keeps small magnitudes out of exponent notation,
  // which `parseDecimalString` would choke on when it calls `BigInt()`.
  if (Math.abs(value) >= 1e21 || (value !== 0 && Math.abs(value) < 1e-6)) {
    const fixed = value.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
    return fixed === '' ? null : fixed;
  }
  return String(value);
}

const YEAR = /\b(1\d{3}|20\d{2}|21\d{2})\b/;

/** The first plausible year in the text — `2015-2017` and `circa 2015` both give 2015. */
function extractYear(raw: string): string | null {
  const match = raw.match(YEAR);
  return match ? match[1] : null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/;
const SLASHED = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/;

function utc(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31 February, which `Date.UTC` would roll forward into March.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString();
}

/**
 * A date, stored as the full ISO string the local store holds (publish narrows
 * it to `YYYY-MM-DD` later).
 *
 * `order` decides `03/04/2015`. Day-first and month-first are separate rules
 * rather than a guess because guessing wrong writes a real, plausible, wrong
 * date — and the model choosing the rule has seen the column's sample values,
 * where a `25/12/2020` settles it instantly.
 */
function coerceDate(raw: string, order: 'auto' | 'dmy' | 'mdy'): CoercionResult {
  const text = raw.trim();

  const iso = text.match(ISO_DATE);
  if (iso) {
    const value = utc(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return value ? { ok: true, value } : SKIP_UNCONVERTIBLE;
  }

  const slashed = text.match(SLASHED);
  if (slashed) {
    const [, a, b, c] = slashed;
    // A four-digit leading part is a year however the rest is ordered.
    if (a.length === 4) {
      const value = utc(Number(a), Number(b), Number(c));
      return value ? { ok: true, value } : SKIP_UNCONVERTIBLE;
    }

    const year = Number(c);
    const first = Number(a);
    const second = Number(b);

    let day: number;
    let month: number;
    if (order === 'dmy') {
      day = first;
      month = second;
    } else if (order === 'mdy') {
      day = second;
      month = first;
    } else if (first > 12 && second <= 12) {
      // Unambiguous: only one ordering can be right.
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      day = second;
      month = first;
    } else {
      // Genuinely ambiguous and nobody has told us which. Writing a plausible
      // wrong date is worse than writing none.
      return SKIP_UNCONVERTIBLE;
    }

    const value = utc(year < 100 ? 2000 + year : year, month, day);
    return value ? { ok: true, value } : SKIP_UNCONVERTIBLE;
  }

  // A bare year is a real answer for "when was this founded".
  if (/^\d{4}$/.test(text)) {
    const value = utc(Number(text), 1, 1);
    return value ? { ok: true, value } : SKIP_UNCONVERTIBLE;
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? SKIP_UNCONVERTIBLE : { ok: true, value: new Date(parsed).toISOString() };
}

const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i;

function coerceTime(raw: string): CoercionResult {
  const text = raw.trim();

  // A spreadsheet time cell arrives as a full ISO timestamp already.
  if (ISO_DATE.test(text)) {
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? SKIP_UNCONVERTIBLE : { ok: true, value: new Date(parsed).toISOString() };
  }

  const match = text.match(TIME);
  if (!match) return SKIP_UNCONVERTIBLE;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  const meridiem = match[4]?.toLowerCase();

  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  if (hours > 23 || minutes > 59 || seconds > 59) return SKIP_UNCONVERTIBLE;

  return { ok: true, value: new Date(Date.UTC(1970, 0, 1, hours, minutes, seconds)).toISOString() };
}

/**
 * Apply one rule to one cell.
 *
 * Returns `{ ok: false }` for anything that should not be written — the caller
 * emits no `Value` at all for those, which is the whole point: an absent
 * property reads as "unknown", where `0` reads as a measurement.
 */
export function coerce(rule: CoercionRule, raw: string): CoercionResult {
  if (isPlaceholder(raw)) return SKIP_PLACEHOLDER;

  const text = raw.trim();

  switch (rule) {
    case 'text':
      return { ok: true, value: text };

    case 'integer': {
      const number = parseNumericString(text);
      if (number === null) return SKIP_UNCONVERTIBLE;
      const value = toIntegerString(number);
      return value === null ? SKIP_UNCONVERTIBLE : { ok: true, value };
    }

    case 'integer:year': {
      const year = extractYear(text);
      if (year !== null) return { ok: true, value: year };
      // `45000` in a year column is an Excel serial that lost its formatting.
      const number = parseNumericString(text);
      if (number !== null && number >= 1000 && number <= 2999) {
        return { ok: true, value: String(Math.round(number)) };
      }
      return SKIP_UNCONVERTIBLE;
    }

    case 'float':
    case 'decimal': {
      const number = parseNumericString(text);
      if (number === null) return SKIP_UNCONVERTIBLE;
      const value = toDecimalString(number);
      return value === null ? SKIP_UNCONVERTIBLE : { ok: true, value };
    }

    case 'boolean': {
      const parsed = parseCheckboxValue(text);
      return parsed.parsed ? { ok: true, value: parsed.value ? '1' : '0' } : SKIP_UNCONVERTIBLE;
    }

    case 'date':
      return coerceDate(text, 'auto');
    case 'date:dmy':
      return coerceDate(text, 'dmy');
    case 'date:mdy':
      return coerceDate(text, 'mdy');

    case 'datetime': {
      const parsed = Date.parse(text);
      return Number.isNaN(parsed) ? SKIP_UNCONVERTIBLE : { ok: true, value: new Date(parsed).toISOString() };
    }

    case 'time':
      return coerceTime(text);
  }
}

export type ColumnCoercionReport = {
  converted: number;
  /** Cells that said "no data". Silent — nothing went wrong. */
  placeholder: number;
  /** Cells we could not read. Worth telling the user about. */
  unconvertible: number;
  /** Up to a few unreadable values, so the report can show rather than assert. */
  examples: string[];
};

const MAX_EXAMPLES = 3;

/**
 * Apply a rule down one column, collecting what happened.
 *
 * The report is what lets the assistant say "4,891 rows have a founding year;
 * 109 said N/A so I left those blank" — told in passing, never asked as a
 * question, and never blocking the import.
 */
export function coerceColumn(
  rule: CoercionRule,
  cells: readonly string[]
): { values: Array<string | null>; report: ColumnCoercionReport } {
  const values: Array<string | null> = [];
  const report: ColumnCoercionReport = { converted: 0, placeholder: 0, unconvertible: 0, examples: [] };

  for (const cell of cells) {
    const result = coerce(rule, cell);
    if (result.ok) {
      values.push(result.value);
      report.converted++;
      continue;
    }

    values.push(null);
    if (result.reason === 'placeholder') {
      report.placeholder++;
    } else {
      report.unconvertible++;
      if (report.examples.length < MAX_EXAMPLES && !report.examples.includes(cell)) {
        report.examples.push(cell);
      }
    }
  }

  return { values, report };
}
