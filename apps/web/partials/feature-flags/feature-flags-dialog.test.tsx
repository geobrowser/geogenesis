import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { featureFlagDefinitions, featureFlagsStorageKey } from '~/core/state/feature-flags';

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
    // Derived rather than listed: what this pins is that the dialog offers *every* flag in the
    // registry and nothing else, which is the property that breaks when one is added. A hand-copied
    // list only re-states the registry, and goes stale the first time someone adds a flag.
    expect(featureFlagButtons.map(button => button.getAttribute('aria-label'))).toEqual(
      featureFlagDefinitions.map(definition => definition.label)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Debate debugging' }));
    fireEvent.click(screen.getByRole('button', { name: 'Debate format selector' }));
    fireEvent.click(screen.getByRole('button', { name: 'Debates debug tab per space' }));

    await waitFor(() => {
      // Values, not key order — see the note in `feature-flags.test.ts`.
      expect(JSON.parse(window.localStorage.getItem(featureFlagsStorageKey) ?? 'null')).toEqual({
        debugDebatesPage: true,
        debateDebugging: true,
        debateFormatSelector: true,
        exploreSidePanel: false,
        bountiesTab: true,
      });
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
