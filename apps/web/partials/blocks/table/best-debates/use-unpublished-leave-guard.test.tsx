import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { LEAVE_SETTLE_MS, useUnpublishedLeaveGuard } from './use-unpublished-leave-guard';

afterEach(cleanup);

function Harness({
  active,
  count = 3,
  onPublish = async () => true,
  leave,
}: {
  active: boolean;
  count?: number;
  onPublish?: () => Promise<boolean>;
  leave: () => void;
}) {
  const { guard, dialog } = useUnpublishedLeaveGuard({ active, count, isPublishing: false, onPublish });
  return (
    <>
      <button type="button" onClick={() => guard(leave)}>
        back
      </button>
      {dialog}
    </>
  );
}

describe('useUnpublishedLeaveGuard', () => {
  it('leaves straight away when nothing is unpublished, with no prompt and no unload warning', () => {
    const leave = vi.fn();
    const add = vi.spyOn(window, 'addEventListener');
    render(<Harness active={false} leave={leave} />);
    fireEvent.click(screen.getByText('back'));
    expect(leave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(add.mock.calls.some(([type]) => String(type) === 'beforeunload')).toBe(false);
    add.mockRestore();
  });

  it('asks first when there are changes, and Keep ranking stays', () => {
    const leave = vi.fn();
    render(<Harness active leave={leave} />);
    fireEvent.click(screen.getByText('back'));
    expect(screen.getByText('Publish your ranking?')).toBeTruthy();
    expect(screen.getByText(/You have 3 changes that aren’t published yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep ranking' }));
    expect(leave).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Leave without publishing leaves without publishing', async () => {
    const leave = vi.fn();
    const onPublish = vi.fn(async () => true);
    // The guard's spare history entry is spent before leaving; jsdom's back() fires popstate.
    vi.spyOn(window.history, 'back').mockImplementation(() => window.dispatchEvent(new PopStateEvent('popstate')));
    render(<Harness active leave={leave} onPublish={onPublish} />);
    fireEvent.click(screen.getByText('back'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leave without publishing' }));
    });
    expect(onPublish).not.toHaveBeenCalled();
    expect(leave).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('Publish and leave publishes, then leaves; a failed publish stays', async () => {
    vi.spyOn(window.history, 'back').mockImplementation(() => window.dispatchEvent(new PopStateEvent('popstate')));
    const leave = vi.fn();
    const failing = vi.fn(async () => false);
    const { unmount } = render(<Harness active leave={leave} onPublish={failing} />);
    fireEvent.click(screen.getByText('back'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish and leave' }));
    });
    expect(failing).toHaveBeenCalledTimes(1);
    expect(leave).not.toHaveBeenCalled();
    unmount();

    const working = vi.fn(async () => true);
    render(<Harness active leave={leave} onPublish={working} />);
    fireEvent.click(screen.getByText('back'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish and leave' }));
    });
    expect(working).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('warns on tab close or reload only while there are changes', () => {
    render(<Harness active leave={vi.fn()} />);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    cleanup();
    render(<Harness active={false} leave={vi.fn()} />);
    const quiet = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false);
  });

  it('catches in-app links while there are changes', () => {
    render(
      <>
        <Harness active leave={vi.fn()} />
        <a href="/space/other">elsewhere</a>
      </>
    );
    fireEvent.click(screen.getByText('elsewhere'));
    expect(screen.getByText('Publish your ranking?')).toBeTruthy();
  });

  describe('after choosing to leave, nothing asks again (Preston, 16 Nov)', () => {
    // A real browser fires popstate for history.back() a task later, after React has re-rendered
    // the screen with its changes still unpublished.
    const asyncBack = () =>
      vi.spyOn(window.history, 'back').mockImplementation(() => {
        setTimeout(() => window.dispatchEvent(new PopStateEvent('popstate')), 0);
      });

    afterEach(() => vi.restoreAllMocks());

    it('the back arrow: Leave without publishing leaves once and never reopens the prompt', async () => {
      asyncBack();
      const leave = vi.fn();
      render(<Harness active leave={leave} />);
      fireEvent.click(screen.getByText('back'));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Leave without publishing' }));
      });
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
      });
      expect(leave).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Publish your ranking?')).toBeNull();
    });

    it('the back arrow: Publish and leave never reopens the prompt either', async () => {
      asyncBack();
      const leave = vi.fn();
      render(<Harness active leave={leave} onPublish={async () => true} />);
      fireEvent.click(screen.getByText('back'));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Publish and leave' }));
      });
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
      });
      expect(leave).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Publish your ranking?')).toBeNull();
    });

    it("an in-app link: Leave without publishing doesn't get the browser's own leave prompt", async () => {
      asyncBack();
      render(
        <>
          <Harness active leave={vi.fn()} />
          <a href="/space/other">elsewhere</a>
        </>
      );
      fireEvent.click(screen.getByText('elsewhere'));
      // The link leaves with a full page load (window.location.assign); jsdom can't navigate, so
      // the unload it starts is dispatched here.
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Leave without publishing' }));
      });
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
      });
      const unload = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(false);
      expect(screen.queryByText('Publish your ranking?')).toBeNull();
      errors.mockRestore();
    });

    it("the browser's Back: Leave without publishing goes back without asking again", async () => {
      const back = asyncBack();
      render(<Harness active leave={vi.fn()} />);
      // Back spends the spare entry and opens the prompt.
      await act(async () => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      expect(screen.getByText('Publish your ranking?')).toBeTruthy();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Leave without publishing' }));
      });
      // The leave is history.back(), whose popstate lands after a re-render.
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
      });
      expect(back).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Publish your ranking?')).toBeNull();
      const unload = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(false);
    });

    it('comes back on when the leave went nowhere (no page before this one), but not while leaving', async () => {
      asyncBack();
      const leave = vi.fn(); // Back with nothing before it: the screen stays.
      render(
        <>
          <Harness active leave={leave} />
          <a href="/space/other">elsewhere</a>
        </>
      );
      fireEvent.click(screen.getByText('back'));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Leave without publishing' }));
      });
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
      });
      expect(leave).toHaveBeenCalledTimes(1);
      // Right after the choice, nothing asks.
      const early = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(early);
      expect(early.defaultPrevented).toBe(false);
      // Once the leave has had its time and the screen is still here, the guard is back.
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, LEAVE_SETTLE_MS + 50));
      });
      const later = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(later);
      expect(later.defaultPrevented).toBe(true);
      fireEvent.click(screen.getByText('elsewhere'));
      expect(screen.getByText('Publish your ranking?')).toBeTruthy();
    });
  });
});
