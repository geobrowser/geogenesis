import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProfileDebateVisibilityButton } from './profile-debate-visibility-button';

afterEach(cleanup);

describe('ProfileDebateVisibilityButton', () => {
  it('labels the visible-debate action as Hide from profile', () => {
    const onClick = vi.fn();
    render(<ProfileDebateVisibilityButton hidden={false} pending={false} onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Hide from profile' });
    expect(button).toHaveAttribute('title', 'Hide from profile');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('labels the hidden-debate action as Unhide from profile', () => {
    render(<ProfileDebateVisibilityButton hidden pending={false} onClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Unhide from profile' })).toHaveAttribute(
      'title',
      'Unhide from profile'
    );
  });
});
