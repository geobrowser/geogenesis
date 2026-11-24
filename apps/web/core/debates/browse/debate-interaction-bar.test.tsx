import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebateInteractionBar } from './debate-interaction-bar';

afterEach(cleanup);

// GEO-3833: the debates app's comments and share are two icon-only circles.
describe('DebateInteractionBar circles', () => {
  it('names the comment count in the accessible label, not on screen', () => {
    const onComment = vi.fn();
    render(<DebateInteractionBar variant="circles" commentCount={12} onComment={onComment} onShare={vi.fn()} />);

    const comments = screen.getByRole('button', { name: 'Open comments, 12 comments' });
    expect(comments).toHaveClass('size-11', 'rounded-full', 'bg-[#efefef]');
    expect(comments).not.toHaveTextContent('12');
    fireEvent.click(comments);
    expect(onComment).toHaveBeenCalledOnce();
  });

  it('says "1 comment" for one', () => {
    render(<DebateInteractionBar variant="circles" commentCount={1} onComment={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Open comments, 1 comment' })).toBeInTheDocument();
  });

  it('keeps the analytics attributes the pills carried', () => {
    render(<DebateInteractionBar variant="circles" commentCount={0} onComment={vi.fn()} onShare={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Open comments/ })).toHaveAttribute(
      'data-geo-analytics-label',
      'Debate comments'
    );
    const share = screen.getByRole('button', { name: 'Share claim' });
    expect(share).toHaveAttribute('data-geo-analytics-label', 'Debate share');
    expect(share).toHaveAttribute('data-geo-analytics-intent', 'debate_action');
  });

  it('holds a disabled Share until there is a debate to share, so the row does not resize', () => {
    const { rerender } = render(<DebateInteractionBar variant="circles" commentCount={0} onComment={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Share claim' })).toBeDisabled();

    const onShare = vi.fn();
    rerender(
      <DebateInteractionBar
        variant="circles"
        commentCount={0}
        onComment={vi.fn()}
        onShare={onShare}
        shareOpen={false}
      />
    );
    const share = screen.getByRole('button', { name: 'Share claim' });
    expect(share).toBeEnabled();
    expect(share).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(share);
    expect(onShare).toHaveBeenCalledOnce();
  });

  it('marks the comments circle as an opener of the global panel where the host says so', () => {
    render(<DebateInteractionBar variant="circles" commentCount={0} onComment={vi.fn()} commentsPanelOpen={false} />);

    expect(screen.getByRole('button', { name: /Open comments/ })).toHaveAttribute('data-entity-comments-opener', '');
  });

  it('leaves the default pills as they were', () => {
    render(<DebateInteractionBar commentCount={3} onComment={vi.fn()} onShare={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Comments (3)' })).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: 'Share debate' })).toBeInTheDocument();
  });
});
