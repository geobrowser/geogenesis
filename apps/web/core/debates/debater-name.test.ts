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

  // geo-chat appends the handle to some display names (GEO-3728's watch popup showed it).
  it('drops a handle geo-chat appends to the name', () => {
    expect(speakerLabel({ display_name: 'Alexa Dominique (alexadominique.8)' })).toBe('Alexa Dominique');
    expect(speakerLabel({ display_name: 'Kevin Garvey (kevin_g) ' })).toBe('Kevin Garvey');
  });

  it('keeps brackets that are part of the name, and a name that is only a handle', () => {
    expect(speakerLabel({ display_name: 'Sam (Samantha) Lee' })).toBe('Sam (Samantha) Lee');
    expect(speakerLabel({ display_name: 'Dr Joy (MD)' })).toBe('Dr Joy (MD)');
    expect(speakerLabel({ display_name: '(alexa.8)' })).toBe('(alexa.8)');
  });
});
