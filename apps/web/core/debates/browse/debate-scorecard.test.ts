import { describe, expect, it } from 'vitest';

import type { DebateParticipant } from '~/core/debates/api';

import { type SpeakerLean, leanHeadline } from './debate-scorecard';

function lean(label: string, agreed: number, answered: number): SpeakerLean {
  return {
    participant: { display_name: label } as DebateParticipant,
    label,
    agreed,
    answered,
    rate: answered === 0 ? null : agreed / answered,
  };
}

describe('leanHeadline', () => {
  it('names the debater the viewer sided with more often', () => {
    expect(leanHeadline([lean('Preston', 5, 7), lean('Scot', 1, 6)])).toBe('You sided with Preston more often');
  });

  // The bug this exists for. Agreeing with 7 of 7 and 6 of 6 is agreeing with both; ranking by raw
  // count called that a lean towards whoever happened to make one more claim, which only reports
  // who talked more.
  it('does not turn a difference in claim count into a lean', () => {
    expect(leanHeadline([lean('Preston', 7, 7), lean('Scot', 6, 6)])).toBe('You agreed with both of them');
  });

  it('reads a shared rejection as a shared rejection', () => {
    expect(leanHeadline([lean('Preston', 0, 7), lean('Scot', 0, 6)])).toBe('You disagreed with both of them');
  });

  it('calls an even split even, at whatever rate', () => {
    expect(leanHeadline([lean('Preston', 2, 4), lean('Scot', 3, 6)])).toBe('You split evenly between them');
  });

  it('says so when only one debater was answered', () => {
    expect(leanHeadline([lean('Preston', 3, 4), lean('Scot', 0, 0)])).toBe("You only answered Preston's claims");
  });

  it('says so when nothing was answered at all', () => {
    expect(leanHeadline([lean('Preston', 0, 0), lean('Scot', 0, 0)])).toBe('You skipped every claim');
  });
});
