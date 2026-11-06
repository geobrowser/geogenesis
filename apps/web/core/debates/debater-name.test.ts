import { describe, expect, it } from 'vitest';

import { peerDisplayName } from '~/partials/availability/peer-availability';

import { UNNAMED_DEBATER, debaterName, speakerLabel } from './debater-name';

const SPACE_ID = '78341ee90d4d40a29181ddc70c97e36c';
const idShaped = /^[0-9a-f]{8}(-?[0-9a-f]{4}){3}-?[0-9a-f]{12}$|^[0-9a-f]{6,}…?$/i;

describe('debaterName', () => {
  it('uses the display name when there is one', () => {
    expect(debaterName('Jean')).toBe('Jean');
    expect(speakerLabel({ display_name: ' Jean ' })).toBe('Jean');
  });

  it.each([null, undefined, '', '   '])('falls back to the neutral label for %j', name => {
    expect(debaterName(name)).toBe(UNNAMED_DEBATER);
  });

  it('never returns an id for an unnamed participant', () => {
    const participant = { display_name: null, profile_space_id: SPACE_ID, user_id: SPACE_ID };
    expect(speakerLabel(participant)).not.toMatch(idShaped);
    expect(peerDisplayName(null, SPACE_ID)).not.toMatch(idShaped);
    expect(peerDisplayName(null, SPACE_ID)).toBe(UNNAMED_DEBATER);
  });
});
