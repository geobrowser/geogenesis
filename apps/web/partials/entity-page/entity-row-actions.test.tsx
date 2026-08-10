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

vi.mock('~/core/debates/claim-debate-button', () => ({
  ClaimDebateButton: () => <div data-action="debate" />,
}));

describe('EntityRowActions', () => {
  it('renders votes, supporting actions, and Debate in the claim design order', () => {
    const { container } = render(
      <EntityRowActions entityId="claim-1" spaceId="space-1">
        <div data-action="comments" />
      </EntityRowActions>
    );

    expect([...container.querySelectorAll('[data-action]')].map(node => node.getAttribute('data-action'))).toEqual([
      'votes',
      'comments',
      'debate',
    ]);
    expect(mocks.voteProps).toMatchObject({
      entityId: 'claim-1',
      spaceId: 'space-1',
      claimResponderAvatarsPosition: 'trailing',
    });
  });
});
