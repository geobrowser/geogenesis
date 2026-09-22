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
  function mockRightSideTrigger() {
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
  }

  function renderMenu(align?: 'start') {
    render(
      <HubMultiFilterMenu
        align={align}
        label="Any space"
        options={[{ value: 'space-1', label: 'Crypto', count: 4 }]}
        values={[]}
        onToggle={() => {}}
        onClear={() => {}}
        clearLabel="Any space"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Any space' }));
  }

  it('accepts a start override for a right-docked panel', async () => {
    mockRightSideTrigger();
    renderMenu('start');

    await waitFor(() =>
      expect(screen.getByText('Crypto').closest('[data-align]')).toHaveAttribute('data-align', 'start')
    );
  });

  it('keeps adaptive placement when no override is provided', async () => {
    mockRightSideTrigger();
    renderMenu();

    await waitFor(() =>
      expect(screen.getByText('Crypto').closest('[data-align]')).toHaveAttribute('data-align', 'end')
    );
  });
});
