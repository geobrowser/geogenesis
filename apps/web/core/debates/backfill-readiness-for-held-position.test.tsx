import { render } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateClaim } from './api';
import { trustedIndexedPosition, useBackfillReadinessForHeldPosition } from './backfill-readiness-for-held-position';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(() => Promise.resolve()),
  ready: true,
  authenticated: true,
  accountKey: 'account-1' as string | null,
}));

vi.mock('./api', () => ({
  notifyClaimResponseIndexed: (...args: unknown[]) => mocks.notify(...(args as [])),
}));

vi.mock('./hooks', () => ({
  useGeoChatAuth: () => ({
    ready: mocks.ready,
    authenticated: mocks.authenticated,
    accountKey: mocks.accountKey,
    getPrivyIdentityToken: () => Promise.resolve('token'),
  }),
}));

function claim(overrides: Partial<DebateClaim> = {}): DebateClaim {
  return {
    claim_entity_id: 'claim-1',
    response_kind: 'stance',
    viewer_response: { position: true, position_label: 'Agree' },
    viewer_debate_ready: false,
    readiness_disabled_reason: null,
    ...overrides,
  } as DebateClaim;
}

// A `DebateClaim` still, because that is one of the two envelopes the hook takes and the wider one:
// the hub's `MatchmakingReadiness` is the same four fields with nothing else on them.
function Harness({
  debateClaim,
  indexedPosition,
}: {
  debateClaim: DebateClaim | null;
  indexedPosition?: boolean | null;
}) {
  useBackfillReadinessForHeldPosition({
    readiness: debateClaim,
    entityId: 'claim-1',
    spaceId: 'space-1',
    indexedPosition,
  });
  return null;
}

/** geo-chat's row after a retraction: no side, not ready, and saying why. */
function withdrawn(overrides: Partial<DebateClaim> = {}) {
  return claim({ viewer_response: null, readiness_disabled_reason: 'claim_response_withdrawn', ...overrides });
}

describe('useBackfillReadinessForHeldPosition', () => {
  beforeEach(() => {
    mocks.notify.mockClear();
    mocks.ready = true;
    mocks.authenticated = true;
    mocks.accountKey = 'account-1';
  });

  it('tells geo-chat about a position it has a response for but no readiness', () => {
    render(<Harness debateClaim={claim()} />);

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify.mock.calls[0]?.slice(0, 4)).toEqual(['space-1', 'claim-1', 'stance', true]);
  });

  /**
   * The kind sent back is ours, not the row's.
   *
   * geo-chat still labels a claim minted before the vocabularies merged `"veracity"`, and this hook
   * forwards a kind to geo-chat — so reading the row would record the retired kind against a
   * response that was published as a stance.
   *
   * The case above cannot catch that: its fixture is already `'stance'`, so reading the row and
   * ignoring it produce the same call. This one differs only in the row's word.
   */
  it('sends stance even when the row still says veracity', () => {
    render(<Harness debateClaim={claim({ response_kind: 'veracity' })} />);

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify.mock.calls[0]?.slice(0, 4)).toEqual(['space-1', 'claim-1', 'stance', true]);
  });

  it('sends once per claim however often the row refetches', () => {
    const view = render(<Harness debateClaim={claim()} />);
    view.rerender(<Harness debateClaim={claim()} />);
    view.rerender(<Harness debateClaim={claim()} />);

    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it('stays quiet once readiness is already on', () => {
    render(<Harness debateClaim={claim({ viewer_debate_ready: true })} />);

    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('stays quiet when the response moved underneath the stored position', () => {
    // `claim_response_kind_changed` is drift the reconcile sweep owns. Standing someone up from a
    // stale side would publish a position they may no longer hold — the one case where guessing is
    // worse than leaving them off.
    render(<Harness debateClaim={claim({ readiness_disabled_reason: 'claim_response_kind_changed' })} />);

    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('stays quiet without a response to stand on', () => {
    render(<Harness debateClaim={claim({ viewer_response: null })} />);

    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('stays quiet with no claim row at all', () => {
    render(<Harness debateClaim={null} />);

    expect(mocks.notify).not.toHaveBeenCalled();
  });

  /**
   * A withdrawal the viewer has since taken back. The row is what is stale, and nothing else repairs
   * it: geo-chat's `viewer_response` follows the row, so only the chain can say the side is held
   * again — and without this the viewer holds a side every surface draws and Request debate refuses
   * with `intent_missing`.
   */
  describe('after a withdrawal', () => {
    it('reports the side the chain holds again', () => {
      render(<Harness debateClaim={withdrawn()} indexedPosition={false} />);

      expect(mocks.notify).toHaveBeenCalledTimes(1);
      expect(mocks.notify.mock.calls[0]?.slice(0, 4)).toEqual(['space-1', 'claim-1', 'stance', false]);
    });

    it('stays quiet while the chain holds nothing either', () => {
      render(<Harness debateClaim={withdrawn()} indexedPosition={null} />);

      expect(mocks.notify).not.toHaveBeenCalled();
    });

    it('stays quiet where the host cannot say what the chain holds', () => {
      render(<Harness debateClaim={withdrawn({ viewer_response: { position: true, position_label: 'Agree' } })} />);

      expect(mocks.notify).not.toHaveBeenCalled();
    });

    it('is not suppressed by an earlier backfill of the same claim', () => {
      const view = render(<Harness debateClaim={claim()} />);
      view.rerender(<Harness debateClaim={withdrawn()} indexedPosition />);

      expect(mocks.notify).toHaveBeenCalledTimes(2);
    });

    it('still leaves a changed response kind to the reconcile sweep', () => {
      render(
        <Harness debateClaim={claim({ readiness_disabled_reason: 'claim_response_kind_changed' })} indexedPosition />
      );

      expect(mocks.notify).not.toHaveBeenCalled();
    });

    it('still stays quiet once readiness is back on', () => {
      render(<Harness debateClaim={withdrawn({ viewer_debate_ready: true })} indexedPosition />);

      expect(mocks.notify).not.toHaveBeenCalled();
    });
  });

  it('waits for auth rather than sending unauthenticated', () => {
    mocks.authenticated = false;
    const view = render(<Harness debateClaim={claim()} />);
    expect(mocks.notify).not.toHaveBeenCalled();

    mocks.authenticated = true;
    view.rerender(<Harness debateClaim={claim()} />);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });
});

describe('trustedIndexedPosition', () => {
  const summary = (indexedViewerDirection: 'positive' | 'negative' | null, isViewerResponseLoading = false) => ({
    indexedViewerDirection,
    isViewerResponseLoading,
  });

  it('reads the side the chain holds', () => {
    expect(trustedIndexedPosition(summary('positive'), false)).toBe(true);
    expect(trustedIndexedPosition(summary('negative'), false)).toBe(false);
    expect(trustedIndexedPosition(summary(null), false)).toBeNull();
  });

  it('says nothing while the read is out', () => {
    expect(trustedIndexedPosition(summary('positive', true), false)).toBeNull();
  });

  // The in-flight write has already told geo-chat, so a withdrawal marks the row withdrawn while this
  // read still holds the side being left. Reporting it would stand the viewer back up on that side.
  it('says nothing while the viewer’s own response is confirming', () => {
    expect(trustedIndexedPosition(summary('positive'), true)).toBeNull();
  });
});
