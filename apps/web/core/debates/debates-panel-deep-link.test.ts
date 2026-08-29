import { describe, expect, it } from 'vitest';

import { SIGN_IN_MODAL, toSignIn } from '~/core/auth/sign-in-deep-link';
import { modalTarget, requestsModal } from '~/core/deep-links/modal-deep-link';

import { DEBATES_MODAL, debatesPanelTab, toDebatesPanel } from './debates-panel-deep-link';

/**
 * Only what is specific to this link. Reading a trigger, clearing one, and the param names are the
 * scheme's, and are covered once in `core/deep-links/modal-deep-link.test.ts` rather than again per
 * feature.
 */
describe('toDebatesPanel', () => {
  it('builds the link', () => {
    expect(toDebatesPanel()).toBe('/explore?modal=debates');
  });

  it('names a tab through the scheme’s sub-target', () => {
    expect(toDebatesPanel({ tab: 'people' })).toBe('/explore?modal=debates&modalTarget=people');
  });

  // The hub is mounted app-wide, so it has no host route to be contextual to.
  it('opens on any route', () => {
    expect(toDebatesPanel({ pathname: '/space/space-1/questions', via: 'email' })).toBe(
      '/space/space-1/questions?modal=debates&via=email'
    );
  });

  it('round-trips through the scheme’s readers', () => {
    const built = new URL(toDebatesPanel({ tab: 'matches' }), 'https://geobrowser.io');

    expect(requestsModal(built.searchParams, DEBATES_MODAL)).toBe(true);
    expect(debatesPanelTab(modalTarget(built.searchParams))).toBe('matches');
  });

  // Both links share the trigger param, so the value has to be the thing that tells them apart —
  // in both directions, since either handler acting on the other's link would clear it.
  it('is distinguishable from the sign-in link', () => {
    const signIn = new URL(toSignIn({ via: 'marketing' }), 'https://geobrowser.io');

    expect(requestsModal(signIn.searchParams, DEBATES_MODAL)).toBe(false);
    expect(requestsModal(signIn.searchParams, SIGN_IN_MODAL)).toBe(true);
  });
});

describe('debatesPanelTab', () => {
  it.each(['claims', 'people', 'matches', 'requests'])('reads the %s tab', tab => {
    expect(debatesPanelTab(tab)).toBe(tab);
  });

  // These links are written by hand and pasted into emails. A stale tab name should land the
  // viewer on the hub's own default rather than stop the hub opening at all.
  it('falls back to the hub default on a target it does not recognise', () => {
    expect(debatesPanelTab('nonsense')).toBeNull();
    expect(debatesPanelTab(null)).toBeNull();
  });

  // Signed-out narrowing belongs to the hub (`visibleTab`, GEO-2725). Duplicating it here would
  // be a second copy of the rule to keep in step.
  it('passes a signed-in-only tab through rather than filtering it', () => {
    expect(debatesPanelTab('requests')).toBe('requests');
  });
});
