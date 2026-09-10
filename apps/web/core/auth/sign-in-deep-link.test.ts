import { describe, expect, it } from 'vitest';

import { modalVia, requestsModal } from '~/core/deep-links/modal-deep-link';

import { SIGN_IN_MODAL, toSignIn } from './sign-in-deep-link';

/**
 * Only what is specific to this link. Reading a trigger, clearing one, and the param names are the
 * scheme's, and are covered once in `core/deep-links/modal-deep-link.test.ts` rather than again per
 * feature.
 */
describe('toSignIn', () => {
  // The marketing site hardcodes whatever this returns, so the shape is the deliverable.
  it('builds the link the marketing site hardcodes', () => {
    expect(toSignIn({ via: 'marketing' })).toBe('/explore?modal=signin&via=marketing');
  });

  it('omits the attribution when there is none to record', () => {
    expect(toSignIn()).toBe('/explore?modal=signin');
  });

  // Nothing about the trigger is specific to Explore — the handler is app-wide — so the same
  // link works for the next surface that wants one.
  it('takes the trigger to another route', () => {
    expect(toSignIn({ pathname: '/root', via: 'email' })).toBe('/root?modal=signin&via=email');
  });

  it('round-trips through the scheme’s readers', () => {
    const built = new URL(toSignIn({ via: 'marketing' }), 'https://geobrowser.io');

    expect(requestsModal(built.searchParams, SIGN_IN_MODAL)).toBe(true);
    expect(modalVia(built.searchParams)).toBe('marketing');
  });

  // Both links share the trigger param, so the value has to be the thing that tells them apart.
  it('is distinguishable from the debates link', () => {
    expect(requestsModal(new URLSearchParams('modal=debates'), SIGN_IN_MODAL)).toBe(false);
  });
});
