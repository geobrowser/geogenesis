import { describe, expect, it } from 'vitest';

import type { DebateParticipant } from '~/core/debates/api';

import { momentsSpeaker } from './use-moments-speakers';

describe('momentsSpeaker', () => {
  // GEO-3728: the label over a debater's half of the video, and over their transcript lines.
  it('labels a debater by name without a handle at its end', () => {
    const participant = {
      display_name: 'Alexa Dominique (alexadominique.8)',
      position: true,
      avatar_cid: null,
      profile_space_id: 'space-1',
    } as unknown as DebateParticipant;
    expect(momentsSpeaker(participant, null)?.name).toBe('Alexa Dominique');
  });
});
