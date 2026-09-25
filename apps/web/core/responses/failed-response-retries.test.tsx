import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Provider } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toast, useToast } from '~/core/hooks/use-toast';

import { FailedResponsesToast, recordFailedResponse, resetFailedResponses } from './failed-response-retries';

function ShowFailedToast() {
  const [, setToast] = useToast();
  return <button onClick={() => setToast(<FailedResponsesToast />, { persistent: true })}>Show</button>;
}

function renderToast() {
  render(
    <Provider>
      <ShowFailedToast />
      <Toast />
    </Provider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Show' }));
}

describe('FailedResponsesToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetFailedResponses();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('counts failed votes and stays up past the normal auto-dismiss', () => {
    recordFailedResponse('a', { retry: vi.fn() });
    renderToast();
    expect(screen.getByText(/Your vote didn't go through/)).toBeInTheDocument();

    act(() => recordFailedResponse('b', { retry: vi.fn() }));
    expect(screen.getByText(/2 votes didn't go through/)).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('retries each failed vote and closes once they all went through', async () => {
    const retries = [vi.fn(async () => resetFailedResponses()), vi.fn()];
    recordFailedResponse('a', { retry: retries[0] });
    renderToast();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    });
    expect(retries[0]).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/didn't go through/)).not.toBeInTheDocument();
  });

  it('dismissing gives up on the failed votes', () => {
    const retry = vi.fn();
    recordFailedResponse('a', { retry });
    renderToast();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/didn't go through/)).not.toBeInTheDocument();
    expect(retry).not.toHaveBeenCalled();
  });
});
