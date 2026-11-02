import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rememberPublicFeedPage, resetLastGoodPublicFeedForTests } from './last-good-public-feed';
import { LEAD_POSTER_PRELOAD_MAX_AGE_MS, leadPosterUrls, readLeadPosterUrls } from './lead-poster-preload';

const S1 = 'https://chat.example/debates/d1/media/artifacts/speaker_still_slot_1/content';
const S2 = 'https://chat.example/debates/d1/media/artifacts/speaker_still_slot_2/content';

const row = (entityId: string, debatePosters?: { slot1: string | null; slot2: string | null }) =>
  ({ entityId, ...(debatePosters ? { debatePosters } : {}) }) as never;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-19T20:00:00Z'));
  resetLastGoodPublicFeedForTests(null);
});

afterEach(() => {
  vi.useRealTimers();
  resetLastGoodPublicFeedForTests(null);
});

describe('leadPosterUrls', () => {
  it('names the stills of the one debate that carries them, slot 1 first', () => {
    expect(leadPosterUrls({ items: [row('a'), row('d1', { slot1: S1, slot2: S2 })] })).toEqual([S1, S2]);
  });

  it('finds them in the reserve, where the lead may wait to be moved up', () => {
    expect(leadPosterUrls({ items: [row('a')], reserve: [row('d1', { slot1: null, slot2: S2 })] })).toEqual([S2]);
  });

  it('names nothing when no debate carries stills', () => {
    expect(leadPosterUrls({ items: [row('a')] })).toEqual([]);
    expect(leadPosterUrls({})).toEqual([]);
  });
});

describe('readLeadPosterUrls', () => {
  it('reads the last good public page', async () => {
    await rememberPublicFeedPage({ items: [row('d1', { slot1: S1, slot2: S2 })] });
    expect(await readLeadPosterUrls()).toEqual([S1, S2]);
  });

  it('names nothing from a page the CDN has since replaced', async () => {
    await rememberPublicFeedPage({ items: [row('d1', { slot1: S1, slot2: S2 })] });
    vi.advanceTimersByTime(LEAD_POSTER_PRELOAD_MAX_AGE_MS + 1);
    expect(await readLeadPosterUrls()).toEqual([]);
  });

  it('names nothing with no page kept', async () => {
    expect(await readLeadPosterUrls()).toEqual([]);
  });
});
