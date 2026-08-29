import { describe, expect, it } from 'vitest';

import { modalVia, requestsModal } from '~/core/deep-links/modal-deep-link';

import { requestsSignInModal, toSignIn } from './sign-in-deep-link';

const params = (search: string) => new URLSearchParams(search);

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

  it('round-trips through the readers', () => {
    const built = new URL(toSignIn({ via: 'marketing' }), 'https://geobrowser.io');

    expect(requestsSignInModal(built.searchParams)).toBe(true);
    expect(modalVia(built.searchParams)).toBe('marketing');
  });

  it('is distinguishable from the debates link', () => {
    expect(requestsSignInModal(params('modal=debates'))).toBe(false);
    expect(requestsModal(params('modal=debates'), 'debates')).toBe(true);
  });
});

describe('requestsSignInModal', () => {
  it('recognises the trigger', () => {
    expect(requestsSignInModal(params('modal=signin'))).toBe(true);
  });

  it('ignores a different modal, so an unrelated deep link never opens the login', () => {
    expect(requestsSignInModal(params('modal=something-else'))).toBe(false);
    expect(requestsSignInModal(params(''))).toBe(false);
    expect(requestsSignInModal(null)).toBe(false);
  });
});
