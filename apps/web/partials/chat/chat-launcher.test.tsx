import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const widget = vi.hoisted(() => vi.fn((_: { openOnMount?: string | null }) => <div data-testid="widget" />));

vi.mock('next/dynamic', () => ({ default: () => widget }));
vi.mock('./assistant-visibility', () => ({ useHideAssistant: () => false }));

import { ChatLauncher } from './chat-launcher';

describe('ChatLauncher', () => {
  afterEach(cleanup);

  it('renders only the button until it is pressed', () => {
    render(<ChatLauncher />);
    expect(screen.queryByTestId('widget')).toBeNull();
    fireEvent.click(screen.getByLabelText('Open assistant'));
    expect(screen.getByTestId('widget')).toBeTruthy();
    expect(widget.mock.calls.at(-1)?.[0].openOnMount).toBe('fab');
  });

  it('loads the widget on Cmd+K', () => {
    render(<ChatLauncher />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true }));
    });
    expect(screen.getByTestId('widget')).toBeTruthy();
    expect(widget.mock.calls.at(-1)?.[0].openOnMount).toBe('keyboard_shortcut');
  });
});
