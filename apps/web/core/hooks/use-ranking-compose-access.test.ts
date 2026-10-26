import { describe, expect, it } from 'vitest';

import { rankingComposeNeedsAccountStep } from './use-ranking-compose-access';

describe('rankingComposeNeedsAccountStep', () => {
  it('sends a signed-out viewer through sign-in', () => {
    expect(rankingComposeNeedsAccountStep('needs-login', false)).toBe(true);
  });

  it('sends a viewer with no space through onboarding', () => {
    expect(rankingComposeNeedsAccountStep('needs-onboarding', false)).toBe(true);
  });

  // Onboarding is done and the space is on its way. A return address recorded now is followed once
  // the space registers, pulling the viewer back to compose from wherever they went since.
  it('asks nothing of a new account whose space is still being created', () => {
    expect(rankingComposeNeedsAccountStep('needs-onboarding', true)).toBe(false);
  });

  it('asks nothing once access is settled', () => {
    expect(rankingComposeNeedsAccountStep('ready', false)).toBe(false);
    expect(rankingComposeNeedsAccountStep('needs-membership', false)).toBe(false);
  });
});
