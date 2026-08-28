import { describe, expect, it } from 'vitest';

import { requestsSignInModal, signInModalSource, toSignIn, urlWithoutSignInModal } from './sign-in-deep-link';

const params = (search: string) => new URLSearchParams(search);

describe('toSignIn', () => {
  // The marketing site hardcodes whatever this returns, so the shape is the deliverable.
  it('builds the link the marketing site hardcodes', () => {
    expect(toSignIn({ source: 'marketing' })).toBe('/explore?modal=signin&source=marketing');
  });

  it('omits the attribution when there is none to record', () => {
    expect(toSignIn()).toBe('/explore?modal=signin');
  });

  // Nothing about the trigger is specific to Explore — the handler is app-wide — so the same
  // link works for the next surface that wants one.
  it('takes the trigger to another route', () => {
    expect(toSignIn({ pathname: '/root', source: 'email' })).toBe('/root?modal=signin&source=email');
  });

  it('round-trips through the readers', () => {
    const built = new URL(toSignIn({ source: 'marketing' }), 'https://geobrowser.io');

    expect(requestsSignInModal(built.searchParams)).toBe(true);
    expect(signInModalSource(built.searchParams)).toBe('marketing');
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

describe('signInModalSource', () => {
  it('reads the attribution', () => {
    expect(signInModalSource(params('modal=signin&source=marketing'))).toBe('marketing');
  });

  it('is null when absent or empty rather than an empty string', () => {
    expect(signInModalSource(params('modal=signin'))).toBeNull();
    expect(signInModalSource(params('modal=signin&source='))).toBeNull();
  });
});

describe('urlWithoutSignInModal', () => {
  it('leaves a clean route once the trigger is spent', () => {
    expect(urlWithoutSignInModal('/explore', params('modal=signin&source=marketing'))).toBe('/explore');
  });

  // The viewer may have landed somewhere that carries its own state. Dropping it to tidy up the
  // trigger would be a worse bug than the one the tidying prevents.
  it('keeps every other param', () => {
    expect(urlWithoutSignInModal('/space/space-1/entity-1', params('modal=signin&source=marketing&tabId=tab-2'))).toBe(
      '/space/space-1/entity-1?tabId=tab-2'
    );
  });

  // A fragment is route state in this app, not decoration — `block-reorder` resolves a linked
  // block out of `window.location.hash`. Rebuilding the URL without it drops the anchor the
  // viewer followed, and `replaceState` rewrites the whole URL, so the loss is not recoverable.
  it('keeps the fragment', () => {
    expect(urlWithoutSignInModal('/space/space-1/entity-1', params('modal=signin&source=email'), '#block-1')).toBe(
      '/space/space-1/entity-1#block-1'
    );
  });

  it('orders the fragment after the surviving params', () => {
    expect(urlWithoutSignInModal('/space/space-1/entity-1', params('modal=signin&tabId=tab-2'), '#block-1')).toBe(
      '/space/space-1/entity-1?tabId=tab-2#block-1'
    );
  });

  // `location.hash` is '' when there is no anchor and '#' for a bare one, and neither should
  // leave a dangling marker on the tidied URL.
  it('adds no marker when there is no anchor', () => {
    expect(urlWithoutSignInModal('/explore', params('modal=signin'), '')).toBe('/explore');
    expect(urlWithoutSignInModal('/explore', params('modal=signin'), '#')).toBe('/explore');
  });

  it('tolerates a bare id from a caller that is not reading location.hash', () => {
    expect(urlWithoutSignInModal('/explore', params('modal=signin'), 'block-1')).toBe('/explore#block-1');
  });

  it('is a no-op on a URL that never carried the trigger', () => {
    expect(urlWithoutSignInModal('/explore', params('tabId=tab-2'))).toBe('/explore?tabId=tab-2');
    expect(urlWithoutSignInModal('/explore', null)).toBe('/explore');
  });
});
