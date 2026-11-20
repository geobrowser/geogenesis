import { describe, expect, it } from 'vitest';

import { rankingComposeAccessStatus, rankingComposeNeedsAccountStep } from './use-ranking-compose-access';

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

describe('rankingComposeAccessStatus', () => {
  const signedIn = {
    isLoadingSmartAccount: false,
    address: '0x1561d60DF8b2840264DEc7f508E911fd708dc41F',
    isLoading: false,
    hasAnswer: true,
    isRegistered: true,
    personalSpaceId: '86892daf69e2411eb9906077c166efdf',
    space: { type: 'PERSONAL' },
    canEdit: true,
  };

  it('waits, rather than sending a viewer to onboarding, while the index has not answered', () => {
    expect(
      rankingComposeAccessStatus({ ...signedIn, hasAnswer: false, isRegistered: false, personalSpaceId: null })
    ).toBe('loading');
  });

  it('sends a viewer the index answered is unregistered to onboarding', () => {
    expect(rankingComposeAccessStatus({ ...signedIn, isRegistered: false, personalSpaceId: null })).toBe(
      'needs-onboarding'
    );
  });

  it('is ready for a registered viewer in a space they can use', () => {
    expect(rankingComposeAccessStatus(signedIn)).toBe('ready');
  });
});
