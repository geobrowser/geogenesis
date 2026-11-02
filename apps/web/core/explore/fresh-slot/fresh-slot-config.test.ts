import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FRESH_SLOT_CONFIG,
  coerceFreshSlotConfig,
  freshSlotActive,
  parseFreshSlotConfig,
} from './fresh-slot-config';

const DEBATE = 'f26d2ad9d0f64bee9e4c18dc5fd4e7bb';
const valid = {
  enabled: true,
  cadence: 4,
  firstPosition: 3,
  maxPerPage: 3,
  freshnessHours: 48,
  perTypeCaps: {},
  seenDemotion: { enabled: false, minViews: 2, days: 3 },
};

describe('parseFreshSlotConfig', () => {
  it('accepts a valid config unchanged', () => {
    expect(parseFreshSlotConfig(valid)).toEqual({ ok: true, config: valid, adjustments: [] });
  });

  it('clamps numbers into range and says so', () => {
    const parsed = parseFreshSlotConfig({
      ...valid,
      cadence: 1,
      firstPosition: 1,
      maxPerPage: 50,
      freshnessHours: 10_000,
    });
    expect(parsed.ok && parsed.config).toMatchObject({
      cadence: 2,
      firstPosition: 2,
      maxPerPage: 6,
      freshnessHours: 336,
    });
    expect(parsed.ok && parsed.adjustments).toHaveLength(4);
  });

  it('rounds fractions', () => {
    const parsed = parseFreshSlotConfig({ ...valid, cadence: 4.6 });
    expect(parsed.ok && parsed.config.cadence).toBe(5);
  });

  it('caps a per-type cap at the per-page maximum and normalizes its id', () => {
    const dashed = `${DEBATE.slice(0, 8)}-${DEBATE.slice(8, 12)}-${DEBATE.slice(12, 16)}-${DEBATE.slice(16, 20)}-${DEBATE.slice(20)}`;
    const parsed = parseFreshSlotConfig({ ...valid, maxPerPage: 2, perTypeCaps: { [dashed.toUpperCase()]: 9 } });
    expect(parsed.ok && parsed.config.perTypeCaps).toEqual({ [DEBATE]: 2 });
  });

  it('rejects values of the wrong kind', () => {
    expect(parseFreshSlotConfig(null)).toMatchObject({ ok: false });
    expect(parseFreshSlotConfig({ ...valid, enabled: 'yes' })).toMatchObject({ ok: false });
    expect(parseFreshSlotConfig({ ...valid, cadence: '4' })).toMatchObject({ ok: false });
    expect(parseFreshSlotConfig({ ...valid, cadence: Number.NaN })).toMatchObject({ ok: false });
    expect(parseFreshSlotConfig({ ...valid, perTypeCaps: { 'not-a-type': 1 } })).toMatchObject({ ok: false });
    expect(parseFreshSlotConfig({ ...valid, perTypeCaps: [] })).toMatchObject({ ok: false });
  });
});

describe('seenDemotion (GEO-3234)', () => {
  const { seenDemotion: _omitted, ...legacy } = valid;

  it('defaults to off when a config saved before it existed has none', () => {
    const parsed = parseFreshSlotConfig(legacy);
    expect(parsed).toEqual({ ok: true, config: valid, adjustments: [] });
    expect(DEFAULT_FRESH_SLOT_CONFIG.seenDemotion).toEqual({ enabled: false, minViews: 2, days: 3 });
    expect(coerceFreshSlotConfig(legacy).seenDemotion.enabled).toBe(false);
  });

  it('clamps views and days into range and says so', () => {
    const parsed = parseFreshSlotConfig({ ...valid, seenDemotion: { enabled: true, minViews: 0, days: 30 } });
    expect(parsed.ok && parsed.config.seenDemotion).toEqual({ enabled: true, minViews: 1, days: 7 });
    expect(parsed.ok && parsed.adjustments).toEqual(['seenDemotion.minViews 0 -> 1', 'seenDemotion.days 30 -> 7']);
    const rounded = parseFreshSlotConfig({ ...valid, seenDemotion: { enabled: true, minViews: 2.6, days: 99 } });
    expect(rounded.ok && rounded.config.seenDemotion).toEqual({ enabled: true, minViews: 3, days: 7 });
  });

  it('rejects values of the wrong kind', () => {
    expect(parseFreshSlotConfig({ ...valid, seenDemotion: true })).toMatchObject({ ok: false });
    expect(parseFreshSlotConfig({ ...valid, seenDemotion: { enabled: 'on', minViews: 2, days: 3 } })).toMatchObject({
      ok: false,
    });
    expect(parseFreshSlotConfig({ ...valid, seenDemotion: { enabled: true, minViews: '2', days: 3 } })).toMatchObject({
      ok: false,
    });
  });
});

describe('coerceFreshSlotConfig', () => {
  it('reads a broken stored record as the default, which is off', () => {
    expect(coerceFreshSlotConfig({ enabled: true })).toEqual(DEFAULT_FRESH_SLOT_CONFIG);
    expect(coerceFreshSlotConfig('garbage')).toEqual(DEFAULT_FRESH_SLOT_CONFIG);
    expect(DEFAULT_FRESH_SLOT_CONFIG.enabled).toBe(false);
  });

  it('clamps a stored record that slipped out of range', () => {
    expect(coerceFreshSlotConfig({ ...valid, maxPerPage: 99 }).maxPerPage).toBe(6);
  });
});

describe('freshSlotActive', () => {
  it('is on only when enabled with room for an item', () => {
    expect(freshSlotActive(valid)).toBe(true);
    expect(freshSlotActive({ ...valid, enabled: false })).toBe(false);
    expect(freshSlotActive({ ...valid, maxPerPage: 0 })).toBe(false);
    expect(freshSlotActive(undefined)).toBe(false);
  });
});
