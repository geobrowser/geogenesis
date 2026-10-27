import { describe, expect, it } from 'vitest';

import { speakerStillUrl } from './speaker-still';

const artifacts = [{ kind: 'final_video' as const }, { kind: 'speaker_still_slot_2' as const }];

describe('speakerStillUrl', () => {
  it('points at the durable content route for a slot that has a still', () => {
    expect(speakerStillUrl('debate1', 2, artifacts)).toMatch(
      /\/debates\/debate1\/media\/artifacts\/speaker_still_slot_2\/content$/
    );
  });

  // The feed derives the id hyphenated, geo-chat returns it bare; either way it is one image.
  it('spells the id the same whether or not it was given hyphenated', () => {
    const bare = '01a13f75b95275c08bcab9465f7bab9b';
    expect(speakerStillUrl('01A13F75-B952-75C0-8BCA-B9465F7BAB9B', 2, artifacts)).toBe(
      speakerStillUrl(bare, 2, artifacts)
    );
    expect(speakerStillUrl(bare, 2, artifacts)).toContain(`/debates/${bare}/`);
  });

  it('is null for a slot whose still was never cut', () => {
    expect(speakerStillUrl('debate-1', 1, artifacts)).toBeNull();
  });

  it('is null while the media response has not arrived, or for an unknown slot', () => {
    expect(speakerStillUrl('debate-1', 1, undefined)).toBeNull();
    expect(speakerStillUrl('debate-1', 3, artifacts)).toBeNull();
    expect(speakerStillUrl('debate-1', null, artifacts)).toBeNull();
  });
});
