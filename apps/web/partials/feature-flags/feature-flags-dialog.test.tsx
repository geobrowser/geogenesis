import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import { featureFlagsStorageKey } from '~/core/state/feature-flags';

import { FeatureFlagsDialog } from './feature-flags-dialog';

describe('FeatureFlagsDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('opens with Cmd/Ctrl+Shift+F and toggles local feature flags', async () => {
    render(
      <Provider store={createStore()}>
        <FeatureFlagsDialog />
      </Provider>
    );

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true, shiftKey: true });

    expect(await screen.findByRole('heading', { name: 'Feature flags' })).toBeTruthy();
    expect(screen.getByText('Debate debugging')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Claims and debates' }));
    fireEvent.click(screen.getByRole('button', { name: 'Debate debugging' }));

    await waitFor(() => {
      expect(window.localStorage.getItem(featureFlagsStorageKey)).toBe(
        JSON.stringify({ questionsTab: true, debateDebugging: true })
      );
    });
  });
});
