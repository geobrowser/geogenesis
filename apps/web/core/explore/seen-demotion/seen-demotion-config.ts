/**
 * Seen demotion on Explore's Best (GEO-3234): the knobs, their defaults and their bounds.
 *
 * Best is the same for everyone and changes slowly, so a returning visitor lands on the same cards
 * every time. With this on, the browser moves a card it has shown this visitor at least `minViews`
 * times in the last `days` days, without the visitor engaging with it, below the unseen cards of
 * its page. It lives in the ranking lab's config (stored with the fresh slot) so it can be turned
 * on and off without a deploy. Shared: no client module may import anything server-only from here.
 */
export type SeenDemotionConfig = {
  enabled: boolean;
  /** N: demote after this many views. */
  minViews: number;
  /** D: counting views from the last D days. */
  days: number;
};

/** Off until someone turns it on from the ranking lab. */
export const DEFAULT_SEEN_DEMOTION_CONFIG: SeenDemotionConfig = { enabled: false, minViews: 2, days: 3 };

/**
 * Inclusive bounds. `days` stops at 7 because the browser keeps 7 days of views; `minViews` stops at
 * the number of views it keeps per card.
 */
export const SEEN_DEMOTION_BOUNDS = {
  minViews: { min: 1, max: 10 },
  days: { min: 1, max: 7 },
} as const;

/** Bumped by hand on any change to how a page is reordered; pages report `+seen.<this>`. */
export const SEEN_DEMOTION_VERSION = 1;

/** What a Best page carries to the browser when seen demotion is on. */
export type SeenDemotionPageConfig = Pick<SeenDemotionConfig, 'minViews' | 'days'>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Validates the `seenDemotion` part of a ranking lab config. Absent means the default (off), so a
 * config saved before this existed still parses. A value of the wrong kind is an error; a number
 * out of range is clamped and reported.
 */
export function parseSeenDemotionConfig(
  input: unknown
): { ok: true; config: SeenDemotionConfig; adjustments: string[] } | { ok: false; errors: string[] } {
  if (input === undefined || input === null) {
    return { ok: true, config: DEFAULT_SEEN_DEMOTION_CONFIG, adjustments: [] };
  }
  if (typeof input !== 'object' || Array.isArray(input))
    return { ok: false, errors: ['seenDemotion must be an object'] };
  const raw = input as Record<string, unknown>;
  const errors: string[] = [];
  const adjustments: string[] = [];
  if (typeof raw.enabled !== 'boolean') errors.push('seenDemotion.enabled must be true or false');
  const numbers = {} as Record<keyof typeof SEEN_DEMOTION_BOUNDS, number>;
  for (const knob of Object.keys(SEEN_DEMOTION_BOUNDS) as (keyof typeof SEEN_DEMOTION_BOUNDS)[]) {
    const value = raw[knob];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`seenDemotion.${knob} must be a number`);
      continue;
    }
    const { min, max } = SEEN_DEMOTION_BOUNDS[knob];
    numbers[knob] = clamp(value, min, max);
    if (numbers[knob] !== value) adjustments.push(`seenDemotion.${knob} ${value} -> ${numbers[knob]}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config: { enabled: raw.enabled as boolean, ...numbers }, adjustments };
}

/** The page payload's form, or null when demotion is off. */
export function seenDemotionPageConfig(config: SeenDemotionConfig | null | undefined): SeenDemotionPageConfig | null {
  return config?.enabled ? { minViews: config.minViews, days: config.days } : null;
}

/**
 * A page payload's config, read defensively: it crossed the network. Anything malformed is off.
 */
export function readSeenDemotionPageConfig(value: unknown): SeenDemotionPageConfig | null {
  if (!value || typeof value !== 'object') return null;
  const { minViews, days } = value as Record<string, unknown>;
  if (typeof minViews !== 'number' || typeof days !== 'number') return null;
  if (!Number.isFinite(minViews) || !Number.isFinite(days)) return null;
  return {
    minViews: clamp(minViews, SEEN_DEMOTION_BOUNDS.minViews.min, SEEN_DEMOTION_BOUNDS.minViews.max),
    days: clamp(days, SEEN_DEMOTION_BOUNDS.days.min, SEEN_DEMOTION_BOUNDS.days.max),
  };
}
