import { describe, expect, it } from 'vitest';

import { toSignIn } from '~/core/auth/sign-in-deep-link';
import { modalTarget, requestsModal } from '~/core/deep-links/modal-deep-link';

import { debatesPanelTab, requestsDebatesPanel, toDebatesPanel } from './debates-panel-deep-link';

const params = (search: string) => new URLSearchParams(search);

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

  it('round-trips through the readers', () => {
    const built = new URL(toDebatesPanel({ tab: 'matches' }), 'https://geobrowser.io');

    expect(requestsDebatesPanel(built.searchParams)).toBe(true);
    expect(debatesPanelTab(modalTarget(built.searchParams))).toBe('matches');
  });

  // Both links share the trigger param, so each has to ignore the other's value rather than
  // treating any `modal` at all as its own.
  it('is distinguishable from the sign-in link', () => {
    const signIn = new URL(toSignIn({ via: 'marketing' }), 'https://geobrowser.io');

    expect(requestsDebatesPanel(signIn.searchParams)).toBe(false);
    expect(requestsModal(signIn.searchParams, 'signin')).toBe(true);
  });
});

describe('requestsDebatesPanel', () => {
  it('recognises the trigger and ignores another modal', () => {
    expect(requestsDebatesPanel(params('modal=debates'))).toBe(true);
    expect(requestsDebatesPanel(params('modal=signin'))).toBe(false);
    expect(requestsDebatesPanel(null)).toBe(false);
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
