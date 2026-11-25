import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { LEAVE_SETTLE_MS, useUnpublishedLeaveGuard } from './use-unpublished-leave-guard';

afterEach(() => {
  cleanup();
  // A spare entry's state left behind would be taken over by the next test's mount.
  window.history.replaceState(null, '', '/');
});

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

  it('Keep ranking after Back keeps the query written since the guard armed (GEO-3774 filters)', () => {
    window.history.replaceState(null, '', '/ranking');
    const { rerender } = render(<Harness active leave={vi.fn()} />);
    // A filter written in place: only the spare entry on top changes.
    act(() => window.history.replaceState(window.history.state, '', '/ranking?recorded=week'));
    rerender(<Harness active leave={vi.fn()} />);
    // Back lands on the entry under it, which still has the query from when the guard armed.
    act(() => {
      window.history.replaceState(null, '', '/ranking');
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });
    expect(screen.getByText('Publish your ranking?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep ranking' }));
    expect(window.location.pathname + window.location.search).toBe('/ranking?recorded=week');
    expect(window.history.state).toMatchObject({ rankingLeaveGuard: expect.any(String) });
  });

  it('Keep ranking keeps the filters when the router re-renders on Back before the guard hears it', () => {
    const states: unknown[] = [];
    const original = window.history.pushState.bind(window.history);
    const push = vi.spyOn(window.history, 'pushState').mockImplementation((...args) => {
      states.push(window.history.state);
      original(...args);
    });
    window.history.replaceState(null, '', '/ranking');
    const { rerender } = render(<Harness active leave={vi.fn()} />);
    act(() => window.history.replaceState(window.history.state, '', '/ranking?recorded=week'));
    rerender(<Harness active leave={vi.fn()} />);
    // Back lands on the marked entry under the spare one; the router renders first (React 19).
    const base = states[0];
    act(() => window.history.replaceState(base, '', '/ranking'));
    rerender(<Harness active leave={vi.fn()} />);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: base }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Keep ranking' }));
    expect(window.location.pathname + window.location.search).toBe('/ranking?recorded=week');
    push.mockRestore();
  });

  function recordBaseStates() {
    const states: unknown[] = [];
    const original = window.history.pushState.bind(window.history);
    const spy = vi.spyOn(window.history, 'pushState').mockImplementation((...args) => {
      states.push(window.history.state);
      original(...args);
    });
    return { states, restore: () => spy.mockRestore() };
  }

  it('after a publish, one Back leaves, filters changed or not, and publishing navigates nowhere', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const bases = recordBaseStates();
    window.history.replaceState(null, '', '/ranking');
    const { rerender } = render(<Harness active leave={vi.fn()} />);
    act(() => window.history.replaceState(window.history.state, '', '/ranking?recorded=week'));
    // Publish clears the changes.
    rerender(<Harness active={false} leave={vi.fn()} />);
    expect(back).not.toHaveBeenCalled();
    // Back spends the spare entry onto the one under it; the guard carries on leaving, without asking.
    const base = bases.states[0];
    act(() => {
      window.history.replaceState(base, '', '/ranking');
      window.dispatchEvent(new PopStateEvent('popstate', { state: base }));
    });
    expect(back).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Publish your ranking?')).toBeNull();

    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: base })));
    expect(back).toHaveBeenCalledTimes(1);
    bases.restore();
    back.mockRestore();
  });

  it('after a publish, jumping to an older page from the Back menu stays there', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    window.history.replaceState(null, '', '/ranking');
    const { rerender } = render(<Harness active leave={vi.fn()} />);
    rerender(<Harness active={false} leave={vi.fn()} />);

    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { __NA: true } })));
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  // jsdom's back() never fires popstate; stand in for the step off the spare entry.
  const syncBack = () =>
    vi.spyOn(window.history, 'back').mockImplementation(() => window.dispatchEvent(new PopStateEvent('popstate')));

  it('after a publish, the back arrow steps off the spare entry, then leaves', () => {
    const back = syncBack();
    const order: string[] = [];
    back.mockImplementation(() => {
      order.push('back');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    const leave = vi.fn(() => order.push('leave'));
    const { rerender } = render(<Harness active leave={leave} />);
    rerender(<Harness active={false} leave={leave} />);
    fireEvent.click(screen.getByText('back'));
    expect(order).toEqual(['back', 'leave']);
    expect(screen.queryByText('Publish your ranking?')).toBeNull();
    // Spent once: the next exit leaves straight away.
    fireEvent.click(screen.getByText('back'));
    expect(order).toEqual(['back', 'leave', 'leave']);
    back.mockRestore();
  });

  it('after a publish, an in-app link steps off the spare entry, then goes through the app', () => {
    const back = syncBack();
    const follow = vi.fn((event: React.MouseEvent) => event.preventDefault());
    const ui = (active: boolean) => (
      <>
        <Harness active={active} leave={vi.fn()} />
        <a href="/space/other" onClick={follow}>
          elsewhere
        </a>
      </>
    );
    const { rerender } = render(ui(true));
    rerender(ui(false));
    fireEvent.click(screen.getByText('elsewhere'));
    expect(back).toHaveBeenCalledTimes(1);
    expect(follow).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Publish your ranking?')).toBeNull();
    back.mockRestore();
  });

  it('with nothing ever unpublished, links and the back arrow are left alone', () => {
    const back = syncBack();
    const follow = vi.fn((event: React.MouseEvent) => event.preventDefault());
    const leave = vi.fn();
    render(
      <>
        <Harness active={false} leave={leave} />
        <a href="/space/other" onClick={follow}>
          elsewhere
        </a>
      </>
    );
    fireEvent.click(screen.getByText('elsewhere'));
    fireEvent.click(screen.getByText('back'));
    expect(follow).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('mounting on a spare entry (a reload) takes it over: no second spare, and one Back leaves', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const push = vi.spyOn(window.history, 'pushState');
    window.history.replaceState({ rankingLeaveGuard: 'T' }, '', '/ranking');
    const { rerender } = render(<Harness active={false} leave={vi.fn()} />);
    rerender(<Harness active leave={vi.fn()} />);
    expect(push).not.toHaveBeenCalled();
    rerender(<Harness active={false} leave={vi.fn()} />);
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { rankingLeaveGuardBase: 'T' } })));
    expect(back).toHaveBeenCalledTimes(1);
    push.mockRestore();
    back.mockRestore();
  });

  it('Forward onto the spare entry after a publish: the next Back still leaves in one press', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    window.history.replaceState(null, '', '/ranking');
    const { rerender } = render(<Harness active leave={vi.fn()} />);
    const spare = window.history.state;
    rerender(<Harness active={false} leave={vi.fn()} />);
    const base = { rankingLeaveGuardBase: spare.rankingLeaveGuard };
    // Back to the base carries on; Forward from the page before comes back onto the spare.
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: base })));
    expect(back).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: spare })));
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: base })));
    expect(back).toHaveBeenCalledTimes(2);
    back.mockRestore();
  });

  it('a new change after a publish still asks on Back', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { rerender } = render(<Harness active leave={vi.fn()} />);
    rerender(<Harness active={false} leave={vi.fn()} />);
    rerender(<Harness active leave={vi.fn()} />);
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: null })));
    expect(screen.getByText('Publish your ranking?')).toBeTruthy();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
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
