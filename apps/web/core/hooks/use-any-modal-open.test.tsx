import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { useAnyModalOpen } from './use-any-modal-open';

function openDialog(attributes: Record<string, string>) {
  const el = document.createElement('div');
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('useAnyModalOpen', () => {
  it('is false with nothing open', () => {
    const { result } = renderHook(() => useAnyModalOpen(true));
    expect(result.current).toBe(false);
  });

  // What Radix actually renders — checked against @radix-ui/react-dialog@1.1.19, which sets
  // `role="dialog"` and `data-state` but no `aria-modal`. Global search and the sign-in prompt are
  // Radix underneath, so a selector wanting `aria-modal` misses both.
  it('sees a Radix dialog, which carries data-state and no aria-modal', async () => {
    const { result } = renderHook(() => useAnyModalOpen(true));

    act(() => void openDialog({ role: 'dialog', 'data-state': 'open' }));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('sees a hand-rolled dialog, which carries aria-modal and no data-state', async () => {
    const { result } = renderHook(() => useAnyModalOpen(true));

    act(() => void openDialog({ role: 'dialog', 'aria-modal': 'true' }));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('sees an alertdialog too', async () => {
    const { result } = renderHook(() => useAnyModalOpen(true));

    act(() => void openDialog({ role: 'alertdialog', 'data-state': 'open' }));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('goes back to false when the dialog closes', async () => {
    const { result } = renderHook(() => useAnyModalOpen(true));
    let dialog: HTMLElement;

    act(() => void (dialog = openDialog({ role: 'dialog', 'data-state': 'open' })));
    await waitFor(() => expect(result.current).toBe(true));

    act(() => dialog.remove());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('ignores a closed Radix dialog left mounted with forceMount', async () => {
    const { result } = renderHook(() => useAnyModalOpen(true));

    act(() => void openDialog({ role: 'dialog', 'data-state': 'closed' }));

    await waitFor(() => expect(result.current).toBe(false));
  });

  // The popup that uses this is a `role="region"`, not a dialog. If this matched non-dialog roles
  // it would suppress the popup because the popup is on screen.
  it('ignores things that are not dialogs, including the region that consumes it', async () => {
    const { result } = renderHook(() => useAnyModalOpen(true));

    act(() => void openDialog({ role: 'region', 'aria-label': 'Geo network launching soon' }));

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('does not watch while disabled, so it costs nothing before the popup is due', async () => {
    const { result } = renderHook(() => useAnyModalOpen(false));

    act(() => void openDialog({ role: 'dialog', 'data-state': 'open' }));

    await waitFor(() => expect(result.current).toBe(false));
  });
});
