import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { HubMultiFilterMenu } from './hub-filter-menu';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HubMultiFilterMenu placement', () => {
  it('stays aligned to the trigger start inside a right-docked panel', async () => {
    vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 140,
      height: 40,
      left: 800,
      right: 900,
      top: 100,
      width: 100,
      x: 800,
      y: 100,
      toJSON: () => {},
    });

    render(
      <HubMultiFilterMenu
        label="Any space"
        options={[{ value: 'space-1', label: 'Crypto', count: 4 }]}
        values={[]}
        onToggle={() => {}}
        onClear={() => {}}
        clearLabel="Any space"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Any space' }));

    await waitFor(() =>
      expect(screen.getByText('Crypto').closest('[data-align]')).toHaveAttribute('data-align', 'start')
    );
  });
});
