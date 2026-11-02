import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EmailVoteNote } from './email-vote-note';

afterEach(cleanup);

describe('EmailVoteNote', () => {
  it('confirms a cast vote under its pill, with Undo', () => {
    const onUndo = vi.fn();
    render(<EmailVoteNote outcome={{ kind: 'cast', position: true }} position viewerPosition onUndo={onUndo} />);
    expect(screen.getByRole('status')).toHaveTextContent('Vote counted · Undo');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('holds Undo while the vote is still on its way to the bundler, as the pills do', () => {
    const onUndo = vi.fn();
    render(
      <EmailVoteNote outcome={{ kind: 'cast', position: true }} position viewerPosition pending onUndo={onUndo} />
    );
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(undo);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('names the side the reader already held, with nothing to press', () => {
    render(
      <EmailVoteNote
        outcome={{ kind: 'kept', position: false }}
        position={false}
        viewerPosition={false}
        onUndo={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('You voted Disagree');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('draws nothing under the other pill, or once the reader has moved off that side', () => {
    const { container, rerender } = render(
      <EmailVoteNote outcome={{ kind: 'cast', position: true }} position={false} viewerPosition onUndo={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <EmailVoteNote outcome={{ kind: 'cast', position: true }} position viewerPosition={false} onUndo={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
