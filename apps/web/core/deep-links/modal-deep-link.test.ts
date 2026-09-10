import { describe, expect, it } from 'vitest';

import { DEEP_LINK_MODALS, modalTarget, modalVia, requestsModal, toModal, urlWithoutModal } from './modal-deep-link';

const params = (search: string) => new URLSearchParams(search);

describe('DEEP_LINK_MODALS', () => {
  // These appear in URLs written down outside this repo, so a rename is a breaking change and the
  // list is worth pinning rather than leaving to whoever edits the map next.
  it('pins the values that appear in shipped URLs', () => {
    expect(DEEP_LINK_MODALS).toEqual({ signIn: 'signin', debates: 'debates' });
  });

  it('gives every link a distinct value', () => {
    const values = Object.values(DEEP_LINK_MODALS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('requestsModal', () => {
  it('recognises its own trigger and no one else’s', () => {
    expect(requestsModal(params('modal=signin'), 'signin')).toBe(true);
    expect(requestsModal(params('modal=debates'), 'signin')).toBe(false);
    expect(requestsModal(params(''), 'signin')).toBe(false);
    expect(requestsModal(null, 'signin')).toBe(false);
  });
});

describe('modalTarget', () => {
  it('reads the sub-target without interpreting it', () => {
    expect(modalTarget(params('modal=debates&modalTarget=people'))).toBe('people');
    expect(modalTarget(params('modal=debates&modalTarget=anything-at-all'))).toBe('anything-at-all');
  });

  it('is null when absent or empty rather than an empty string', () => {
    expect(modalTarget(params('modal=debates'))).toBeNull();
    expect(modalTarget(params('modal=debates&modalTarget='))).toBeNull();
  });

  // `tab` belongs to the ranking compose screen (`use-ranking-block-state`), which is why the
  // sub-target is `modalTarget`.
  it('does not read the ranking screen’s `tab` param', () => {
    expect(modalTarget(params('modal=debates&tab=my'))).toBeNull();
  });
});

describe('modalVia', () => {
  it('reads attribution', () => {
    expect(modalVia(params('modal=signin&via=marketing'))).toBe('marketing');
  });

  it('is null when absent or empty', () => {
    expect(modalVia(params('modal=signin'))).toBeNull();
    expect(modalVia(params('modal=signin&via='))).toBeNull();
  });

  // The whole reason attribution is not `source`: that key is the block link's trigger.
  it('does not read `source`, which belongs to the block link', () => {
    expect(modalVia(params('modal=signin&source=copy_link'))).toBeNull();
  });
});

describe('urlWithoutModal', () => {
  it('leaves a clean route once the trigger is spent', () => {
    expect(urlWithoutModal('/explore', params('modal=debates&modalTarget=people&via=email'))).toBe('/explore');
  });

  // The viewer may have landed somewhere carrying its own state. Dropping it to tidy up the
  // trigger would be a worse bug than the one the tidying prevents.
  it('keeps every other param', () => {
    expect(urlWithoutModal('/space/space-1/entity-1', params('modal=signin&via=marketing&tabId=tab-2'))).toBe(
      '/space/space-1/entity-1?tabId=tab-2'
    );
  });

  /**
   * The collision that made attribution move off `source`. A URL carrying both a modal trigger and
   * a block link had `source=copy_link` stripped here, so `block-reorder` never ran its reveal —
   * the block link broke silently on any page that also opened a modal.
   */
  it('leaves `source` alone, so a block link on the same URL still reveals', () => {
    expect(urlWithoutModal('/space/space-1/entity-1', params('modal=signin&source=copy_link'), '#block-1')).toBe(
      '/space/space-1/entity-1?source=copy_link#block-1'
    );
  });

  it('keeps the fragment, which addresses a position rather than an action', () => {
    expect(urlWithoutModal('/space/space-1/entity-1', params('modal=debates&modalTarget=people'), '#block-1')).toBe(
      '/space/space-1/entity-1#block-1'
    );
  });

  it('adds no marker when there is no anchor', () => {
    expect(urlWithoutModal('/explore', params('modal=signin'), '')).toBe('/explore');
    expect(urlWithoutModal('/explore', params('modal=signin'), '#')).toBe('/explore');
  });

  it('tolerates a bare id from a caller that is not reading location.hash', () => {
    expect(urlWithoutModal('/explore', params('modal=signin'), 'block-1')).toBe('/explore#block-1');
  });

  it('is a no-op on a URL that never carried a trigger', () => {
    expect(urlWithoutModal('/explore', params('tabId=tab-2'))).toBe('/explore?tabId=tab-2');
    expect(urlWithoutModal('/explore', null)).toBe('/explore');
  });
});

describe('toModal', () => {
  it('builds a bare trigger', () => {
    expect(toModal({ modal: 'debates', pathname: '/explore' })).toBe('/explore?modal=debates');
  });

  it('adds the sub-target and attribution when given', () => {
    expect(toModal({ modal: 'debates', pathname: '/explore', target: 'people', via: 'email' })).toBe(
      '/explore?modal=debates&modalTarget=people&via=email'
    );
  });

  it('round-trips through the readers', () => {
    const url = new URL(toModal({ modal: 'signin', pathname: '/explore', via: 'marketing' }), 'https://geobrowser.io');

    expect(requestsModal(url.searchParams, 'signin')).toBe(true);
    expect(modalVia(url.searchParams)).toBe('marketing');
  });
});
