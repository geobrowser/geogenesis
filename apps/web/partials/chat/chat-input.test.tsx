import { cleanup, fireEvent, render, within } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatInput } from './chat-input';

afterEach(() => {
  cleanup();
});

describe('ChatInput', () => {
  it('does not render a native form that can reload the page', () => {
    const { container } = render(<ChatInput value="Hello" onChange={() => {}} onSubmit={() => {}} />);

    expect(container.querySelector('form')).toBeNull();
    expect(within(container).getByRole('button', { name: 'Send message' }).getAttribute('type')).toBe('button');
  });

  it('submits with Enter through the controlled handler', () => {
    const onSubmit = vi.fn();
    const { container } = render(<ChatInput value="Hello" onChange={() => {}} onSubmit={onSubmit} />);

    fireEvent.keyDown(within(container).getByPlaceholderText('Ask anything...'), { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('keeps Shift+Enter available for multiline drafts', () => {
    const onSubmit = vi.fn();
    const { container } = render(<ChatInput value="Hello" onChange={() => {}} onSubmit={onSubmit} />);

    fireEvent.keyDown(within(container).getByPlaceholderText('Ask anything...'), { key: 'Enter', shiftKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
