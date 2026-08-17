import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { featureFlagsStorageKey } from '~/core/state/feature-flags';

import { FeatureFlagsDialog } from './feature-flags-dialog';

const navigation = vi.hoisted(() => ({
  pathname: '/',
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));

describe('FeatureFlagsDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
    navigation.pathname = '/';
    navigation.replace.mockReset();
  });

  afterEach(cleanup);

  it('opens with Cmd/Ctrl+Shift+F and toggles local feature flags', async () => {
    render(
      <Provider store={createStore()}>
        <FeatureFlagsDialog />
      </Provider>
    );

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true, shiftKey: true });

    expect(await screen.findByRole('heading', { name: 'Feature flags' })).toBeTruthy();
    expect(screen.getByText('Debate debugging')).toBeTruthy();
    expect(screen.getByText('Debate format selector')).toBeTruthy();
    expect(screen.getByText('Debates debug tab per space')).toBeTruthy();

    const featureFlagButtons = screen
      .getAllByRole('button')
      .filter(button => button.getAttribute('aria-label') !== 'Close feature flags');
    expect(featureFlagButtons.map(button => button.getAttribute('aria-label'))).toEqual([
      'Debate debugging',
      'Debate format selector',
      'Debates debug tab per space',
      'Bounties',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Debate debugging' }));
    fireEvent.click(screen.getByRole('button', { name: 'Debate format selector' }));
    fireEvent.click(screen.getByRole('button', { name: 'Debates debug tab per space' }));

    await waitFor(() => {
      expect(window.localStorage.getItem(featureFlagsStorageKey)).toBe(
        JSON.stringify({
          debugDebatesPage: true,
          debateDebugging: true,
          debateFormatSelector: true,
          bountiesTab: false,
        })
      );
    });
  });

  it('opens when visiting the hidden flags route', async () => {
    navigation.pathname = '/feature-flags';

    render(
      <Provider store={createStore()}>
        <FeatureFlagsDialog />
      </Provider>
    );

    expect(await screen.findByRole('heading', { name: 'Feature flags' })).toBeTruthy();
  });

  it('returns to the root space when closing the dialog from the hidden flags route', async () => {
    navigation.pathname = '/feature-flags';

    render(
      <Provider store={createStore()}>
        <FeatureFlagsDialog />
      </Provider>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Close feature flags' }));

    expect(navigation.replace).toHaveBeenCalledWith('/root');
  });
});
