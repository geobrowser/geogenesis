import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntityCommentsPanel } from './entity-comments-panel';

vi.mock('~/core/hooks/use-comments', () => ({
  useComments: () => ({ comments: [], totalCount: 3, isLoading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('./comments-section', () => ({
  CommentSection: () => <div>Comment section</div>,
}));

afterEach(cleanup);

describe('EntityCommentsPanel', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  // Opening a comment author's profile stacks the entity side panel above this
  // one. Both listen on the window, so without deferring, a single press would
  // dismiss both layers at once instead of just the one on top.
  it('leaves Escape to the entity side panel stacked above it', () => {
    const onClose = vi.fn();
    const sidePanel = document.createElement('aside');
    sidePanel.setAttribute('data-entity-side-panel', '');
    document.body.appendChild(sidePanel);

    render(<EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    sidePanel.remove();
  });

  it('ignores Escape while composing text', () => {
    const onClose = vi.fn();
    render(<EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape', isComposing: true });

    expect(onClose).not.toHaveBeenCalled();
  });
});
