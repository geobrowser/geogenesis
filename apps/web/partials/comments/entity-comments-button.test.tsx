import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntityCommentsButton } from './entity-comments-button';

const mocks = vi.hoisted(() => ({
  openComments: vi.fn(),
}));

vi.mock('~/core/hooks/use-comment-count', () => ({ useCommentCount: (_entityId: string, count: number) => count }));
vi.mock('~/core/hooks/use-entity-comments-panel', () => ({
  useEntityCommentsPanel: () => ({ commentsTarget: null, openComments: mocks.openComments }),
}));

afterEach(() => {
  cleanup();
  mocks.openComments.mockReset();
});

describe('EntityCommentsButton', () => {
  it('opens the global panel with stable click and target-type attribution', () => {
    render(<EntityCommentsButton entityId="claim-1" spaceId="space-1" targetEntityType="claim" count={3} />);

    const button = screen.getByRole('button', { name: 'Comments (3)' });
    expect(button).toHaveAttribute('data-geo-analytics-label', 'Open claim comments panel');
    expect(button).toHaveAttribute('data-geo-analytics-intent', 'open_comments_panel');

    fireEvent.click(button);

    expect(mocks.openComments).toHaveBeenCalledWith('claim-1', 'space-1', 'claim');
  });

  /**
   * On the Explore card the number is the claim's whole activity — its debates and the claims extracted
   * from them as well as its comments. The button always announced it as "Comments", so a claim with one
   * comment and a debate behind it was read out as having dozens of comments.
   */
  it('announces an activity total as activity, not as comments', () => {
    render(
      <EntityCommentsButton
        entityId="claim-1"
        spaceId="space-1"
        targetEntityType="claim"
        count={42}
        commentsInCount={1}
      />
    );

    expect(screen.getByRole('button', { name: 'Activity (42)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Comments/ })).not.toBeInTheDocument();
  });
});
