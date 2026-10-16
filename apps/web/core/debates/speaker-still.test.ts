import { describe, expect, it } from 'vitest';

import { speakerStillUrl } from './speaker-still';

const artifacts = [{ kind: 'final_video' as const }, { kind: 'speaker_still_slot_2' as const }];

describe('speakerStillUrl', () => {
  it('points at the durable content route for a slot that has a still', () => {
    expect(speakerStillUrl('debate-1', 2, artifacts)).toMatch(
      /\/debates\/debate-1\/media\/artifacts\/speaker_still_slot_2\/content$/
    );
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
