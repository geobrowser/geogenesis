import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RankingPlacedDialog } from './ranking-placed-dialog';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockScreen(short: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: short && query.includes('max-height'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

const ids = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'];

function renderPlaced() {
  render(
    <RankingPlacedDialog
      entityId="d4"
      orderedIds={ids}
      nameOf={id => `Debate ${id}`}
      withOtherChanges={false}
      publishFailed={false}
      isSaving={false}
      onNudge={vi.fn()}
      onDone={vi.fn()}
      onClose={vi.fn()}
    />
  );
  return screen.getByTestId('placed-neighbours').querySelectorAll('li');
}

describe('RankingPlacedDialog', () => {
  it('shows two debates either side on a tall screen', () => {
    mockScreen(false);
    expect(renderPlaced()).toHaveLength(5);
  });

  it('shows one either side on a short screen (an iPhone SE), so the sheet fits', () => {
    mockScreen(true);
    const rows = renderPlaced();
    expect(rows).toHaveLength(3);
    expect(rows[1]!.getAttribute('aria-current')).toBe('true');
  });

  it('keeps the title and Done outside the part that scrolls', () => {
    mockScreen(true);
    renderPlaced();
    const body = screen.getByTestId('ranking-flow-dialog-body');
    expect(body.contains(screen.getByText('Placed #4 of 7'))).toBe(false);
    expect(body.contains(screen.getByRole('button', { name: 'Done' }))).toBe(false);
    expect(body.contains(screen.getByTestId('placed-neighbours'))).toBe(true);
  });
});
