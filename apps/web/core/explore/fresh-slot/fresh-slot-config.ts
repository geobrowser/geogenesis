import { normId } from '~/core/utils/norm-id';

/**
 * The fresh slot on Explore's Best (GEO-3221, phase 1): the knobs an admin can change without a
 * deploy, their defaults and their bounds.
 *
 * Best is a stored, time-invariant score, so a new item only reaches it by collecting votes, and
 * votes compound with exposure. Rather than change the score, the newest eligible items are merged
 * into Best's page at read time: one fresh item every `cadence` positions, starting at
 * `firstPosition`, at most `maxPerPage` per page and `perTypeCaps[type]` of one type, and only
 * while the item is younger than `freshnessHours`.
 */
export type FreshSlotConfig = {
  enabled: boolean;
  /** N: one fresh item every N positions. */
  cadence: number;
  /** P: the 1-based page position of the first fresh item. */
  firstPosition: number;
  /** K: at most this many fresh items on one page. */
  maxPerPage: number;
  /** W: an item is fresh only while it is younger than this. */
  freshnessHours: number;
  /** Normalized type id to the most fresh items of that type on one page. Unlisted types: no cap. */
  perTypeCaps: Record<string, number>;
};

/** Off until someone turns it on from the ranking lab. */
export const DEFAULT_FRESH_SLOT_CONFIG: FreshSlotConfig = {
  enabled: false,
  cadence: 4,
  firstPosition: 3,
  maxPerPage: 3,
  freshnessHours: 48,
  perTypeCaps: {},
};

/**
 * Inclusive bounds. `firstPosition` starts at 2 so the lead debate (GEO-3070) always keeps the
 * first card; `maxPerPage` stays well under a page so Best remains the page's majority.
 */
export const FRESH_SLOT_BOUNDS = {
  cadence: { min: 2, max: 22 },
  firstPosition: { min: 2, max: 22 },
  maxPerPage: { min: 0, max: 6 },
  freshnessHours: { min: 1, max: 336 },
} as const;

const MAX_TYPE_CAPS = 20;

type NumericKnob = keyof typeof FRESH_SLOT_BOUNDS;
const NUMERIC_KNOBS = Object.keys(FRESH_SLOT_BOUNDS) as NumericKnob[];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export type FreshSlotConfigParse =
  { ok: true; config: FreshSlotConfig; adjustments: string[] } | { ok: false; errors: string[] };

/**
 * Validates a config an admin submitted. A value of the wrong kind is rejected; a number out of
 * range is clamped into it and reported, so the saved config is always one the feed can serve.
 */
export function parseFreshSlotConfig(input: unknown): FreshSlotConfigParse {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['config must be an object'] };
  }
  const raw = input as Record<string, unknown>;
  const errors: string[] = [];
  const adjustments: string[] = [];

  if (typeof raw.enabled !== 'boolean') errors.push('enabled must be true or false');

  const numbers = {} as Record<NumericKnob, number>;
  for (const knob of NUMERIC_KNOBS) {
    const value = raw[knob];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${knob} must be a number`);
      continue;
    }
    const { min, max } = FRESH_SLOT_BOUNDS[knob];
    numbers[knob] = clamp(value, min, max);
    if (numbers[knob] !== value) adjustments.push(`${knob} ${value} -> ${numbers[knob]}`);
  }

  const perTypeCaps: Record<string, number> = {};
  const caps = raw.perTypeCaps ?? {};
  if (!caps || typeof caps !== 'object' || Array.isArray(caps)) {
    errors.push('perTypeCaps must be an object of type id to number');
  } else {
    const entries = Object.entries(caps as Record<string, unknown>);
    if (entries.length > MAX_TYPE_CAPS) errors.push(`perTypeCaps holds at most ${MAX_TYPE_CAPS} types`);
    for (const [typeId, value] of entries) {
      const id = normId(typeId);
      if (!/^[0-9a-f]{32}$/.test(id)) {
        errors.push(`perTypeCaps: ${typeId} is not a type id`);
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`perTypeCaps.${id} must be a number`);
        continue;
      }
      const capped = clamp(value, 0, numbers.maxPerPage ?? FRESH_SLOT_BOUNDS.maxPerPage.max);
      if (capped !== value) adjustments.push(`perTypeCaps.${id} ${value} -> ${capped}`);
      perTypeCaps[id] = capped;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config: { enabled: raw.enabled as boolean, ...numbers, perTypeCaps }, adjustments };
}

/**
 * The same rules applied to a stored config, leniently: whatever does not parse falls back to the
 * default, which is disabled. Serving must never fail on a bad record.
 */
export function coerceFreshSlotConfig(input: unknown): FreshSlotConfig {
  const parsed = parseFreshSlotConfig(input);
  return parsed.ok ? parsed.config : DEFAULT_FRESH_SLOT_CONFIG;
}

/** Whether a config would put anything on a page. */
export function freshSlotActive(config: FreshSlotConfig | null | undefined): config is FreshSlotConfig {
  return Boolean(config?.enabled && config.maxPerPage > 0);
}
