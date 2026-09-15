import { render } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateClaim } from './api';
import { useBackfillReadinessForHeldPosition } from './backfill-readiness-for-held-position';

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
function Harness({ debateClaim }: { debateClaim: DebateClaim | null }) {
  useBackfillReadinessForHeldPosition({ readiness: debateClaim, entityId: 'claim-1', spaceId: 'space-1' });
  return null;
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

  it('waits for auth rather than sending unauthenticated', () => {
    mocks.authenticated = false;
    const view = render(<Harness debateClaim={claim()} />);
    expect(mocks.notify).not.toHaveBeenCalled();

    mocks.authenticated = true;
    view.rerender(<Harness debateClaim={claim()} />);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });
});
