import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FullscreenLink } from './fullscreen-link';

// Reaches for the sync engine and the router, neither of which this control's behavior depends on.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({
    children,
    entityId: _entityId,
    spaceId: _spaceId,
    ...props
  }: React.ComponentPropsWithoutRef<'a'> & { entityId?: string; spaceId?: string }) => <a {...props}>{children}</a>,
}));

afterEach(cleanup);

describe('FullscreenLink', () => {
  it('opens its target when enabled', () => {
    render(<FullscreenLink href="/space/s/e" ariaLabel="Open fullscreen" />);

    const link = screen.getByRole('link', { name: 'Open fullscreen' });
    expect(link.getAttribute('href')).toBe('/space/s/e');
    expect(link.hasAttribute('aria-disabled')).toBe(false);
    expect(link.hasAttribute('tabindex')).toBe(false);

    // Nothing cancels the navigation.
    expect(fireEvent.click(link)).toBe(true);
  });

  /**
   * `pointer-events-none` stops a mouse, `tabIndex={-1}` stops Tab and `aria-disabled` only says
   * so. None of them stop an activation arriving another way — assistive tech, a programmatic
   * `focus()` and Enter, a synthesized click — and the `href` has to stay for the enabled case, so
   * the navigation itself has to be refused.
   */
  it('refuses to navigate when disabled, however the activation arrives', () => {
    render(<FullscreenLink href="/space/s/e" ariaLabel="Open fullscreen" disabled />);

    const link = screen.getByRole('link', { name: 'Open fullscreen' });
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.getAttribute('tabindex')).toBe('-1');

    // `fireEvent` returns false when a handler called preventDefault, which is what stops the
    // browser following the href. A click is what Enter on a focused anchor dispatches too.
    expect(fireEvent.click(link)).toBe(false);
  });
});
