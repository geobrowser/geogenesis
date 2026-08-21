import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntityCommentsPanel } from './entity-comments-panel';
import { SIDE_PANEL_WIDTH_CLASS } from '~/partials/side-panel-layout';

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

const DOCKED_WIDTH_CLASS = 'w-[360px]';

function renderPanelForWidth(presentation: 'docked' | 'overlay') {
  const { container } = render(
    <EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={vi.fn()} presentation={presentation} />
  );
  return container.querySelector('aside') as HTMLElement;
}

describe('EntityCommentsPanel width', () => {
  it('matches the entity side panel when it is an overlay', () => {
    // Both are right-edge panels reachable from the same places, so a width difference
    // reads as a bug. Asserted against the shared constant rather than a pasted value,
    // so this stays true if that width is ever retuned.
    const panel = renderPanelForWidth('overlay');

    expect([...panel.classList]).toContain(SIDE_PANEL_WIDTH_CLASS);
    expect([...panel.classList]).not.toContain(DOCKED_WIDTH_CLASS);
  });

  it('keeps the narrower column width when docked in the debates feed', () => {
    // Docked it sits beside JoinDebatePanel and DebateClaimsPanel, which are 360px.
    // Widening it to the overlay width here would squeeze the debate players.
    const panel = renderPanelForWidth('docked');

    expect([...panel.classList]).toContain(DOCKED_WIDTH_CLASS);
    expect([...panel.classList]).not.toContain(SIDE_PANEL_WIDTH_CLASS);
  });
});
