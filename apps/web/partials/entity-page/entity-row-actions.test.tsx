import { render } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { EntityRowActions } from './entity-row-actions';

const mocks = vi.hoisted(() => ({
  voteProps: null as null | Record<string, unknown>,
}));

vi.mock('./entity-vote-buttons', () => ({
  EntityVoteButtons: (props: Record<string, unknown>) => {
    mocks.voteProps = props;
    return <div data-action="votes" />;
  },
}));

describe('EntityRowActions', () => {
  it('renders votes then supporting actions', () => {
    const { container } = render(
      <EntityRowActions entityId="claim-1" spaceId="space-1">
        <div data-action="comments" />
      </EntityRowActions>
    );

    expect([...container.querySelectorAll('[data-action]')].map(node => node.getAttribute('data-action'))).toEqual([
      'votes',
      'comments',
    ]);
    expect(mocks.voteProps).toMatchObject({
      entityId: 'claim-1',
      spaceId: 'space-1',
      claimResponderAvatarsPosition: 'trailing',
    });
  });

  it('no longer renders a Debate control', () => {
    // The row used to end in `ClaimDebateButton`, whose only job was the per-claim Debate toggle
    // (GEO-2740). Worth an assertion rather than an absence: dropping it also dropped a geo-chat
    // `useDebateClaims` query per row, which is the cost GEO-2724 is about, so a reintroduction
    // here is expensive as well as wrong.
    const { container } = render(<EntityRowActions entityId="claim-1" spaceId="space-1" />);

    expect(container.querySelector('[data-action="debate"]')).toBeNull();
    expect(container.querySelector('[role="switch"]')).toBeNull();
  });
});
