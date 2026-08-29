import { describe, expect, it } from 'vitest';

import { toSignIn } from '~/core/auth/sign-in-deep-link';

import {
  debatesPanelSource,
  debatesPanelTab,
  requestsDebatesPanel,
  toDebatesPanel,
  urlWithoutDebatesPanel,
} from './debates-panel-deep-link';

const params = (search: string) => new URLSearchParams(search);

describe('toDebatesPanel', () => {
  it('builds the link', () => {
    expect(toDebatesPanel()).toBe('/explore?modal=debates');
  });

  it('names a tab when the caller wants one', () => {
    expect(toDebatesPanel({ tab: 'people' })).toBe('/explore?modal=debates&modalTab=people');
  });

  // The hub is mounted app-wide, so it has no host route to be contextual to.
  it('opens on any route', () => {
    expect(toDebatesPanel({ pathname: '/space/space-1/questions', source: 'email' })).toBe(
      '/space/space-1/questions?modal=debates&source=email'
    );
  });

  it('round-trips through the readers', () => {
    const built = new URL(toDebatesPanel({ tab: 'matches', source: 'email' }), 'https://geobrowser.io');

    expect(requestsDebatesPanel(built.searchParams)).toBe(true);
    expect(debatesPanelTab(built.searchParams)).toBe('matches');
    expect(debatesPanelSource(built.searchParams)).toBe('email');
  });

  // Both links share the trigger param, so each has to ignore the other's value rather than
  // treating any `modal` at all as its own.
  it('is distinguishable from the sign-in link', () => {
    const signIn = new URL(toSignIn({ source: 'marketing' }), 'https://geobrowser.io');

    expect(requestsDebatesPanel(signIn.searchParams)).toBe(false);
  });
});

describe('requestsDebatesPanel', () => {
  it('recognises the trigger', () => {
    expect(requestsDebatesPanel(params('modal=debates'))).toBe(true);
  });

  it('ignores another modal, so an unrelated deep link never opens the hub', () => {
    expect(requestsDebatesPanel(params('modal=signin'))).toBe(false);
    expect(requestsDebatesPanel(params(''))).toBe(false);
    expect(requestsDebatesPanel(null)).toBe(false);
  });
});

describe('debatesPanelTab', () => {
  it.each(['claims', 'people', 'matches', 'requests'])('reads the %s tab', tab => {
    expect(debatesPanelTab(params(`modal=debates&modalTab=${tab}`))).toBe(tab);
  });

  // These links are written by hand and pasted into emails. A stale tab name should land the
  // viewer on the hub's own default rather than stop the hub opening at all.
  it('falls back to the hub default on a tab it does not recognise', () => {
    expect(debatesPanelTab(params('modal=debates&modalTab=nonsense'))).toBeNull();
    expect(debatesPanelTab(params('modal=debates'))).toBeNull();
  });

  // Signed-out narrowing belongs to the hub (`visibleTab`, GEO-2725). Duplicating it here would
  // be a second copy of the rule to keep in step.
  it('passes a signed-in-only tab through rather than filtering it', () => {
    expect(debatesPanelTab(params('modal=debates&modalTab=requests'))).toBe('requests');
  });

  // `tab` is the ranking compose screen's param (`use-ranking-block-state`), which is why the
  // sub-target is `modalTab`.
  it('does not read the ranking screen’s `tab` param', () => {
    expect(debatesPanelTab(params('modal=debates&tab=my'))).toBeNull();
  });
});

describe('urlWithoutDebatesPanel', () => {
  it('leaves a clean route once the trigger is spent', () => {
    expect(urlWithoutDebatesPanel('/explore', params('modal=debates&modalTab=people&source=email'))).toBe('/explore');
  });

  it('keeps every other param and the fragment', () => {
    expect(
      urlWithoutDebatesPanel('/space/space-1/entity-1', params('modal=debates&modalTab=people&tabId=tab-2'), '#block-1')
    ).toBe('/space/space-1/entity-1?tabId=tab-2#block-1');
  });

  it('is a no-op on a URL that never carried the trigger', () => {
    expect(urlWithoutDebatesPanel('/explore', params('tabId=tab-2'))).toBe('/explore?tabId=tab-2');
  });
});
