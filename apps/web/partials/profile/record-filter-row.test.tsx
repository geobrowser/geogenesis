import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecordFilterRow } from './record-filter-row';

vi.mock('~/core/debates/matchmaking/hub-filter-menu', () => ({
  HubFilterMenu: ({ label }: { label: string }) => <button>{label}</button>,
  HubMultiFilterMenu: ({ label }: { label: string }) => <button>{label}</button>,
  pickerLabel: () => 'Any space',
}));

afterEach(cleanup);

describe('RecordFilterRow', () => {
  it('places a tab-specific control directly after the dimension menus', () => {
    render(
      <RecordFilterRow
        sort={{ value: 'best', options: [{ value: 'best', label: 'Best' }], onChange: vi.fn() }}
        dimensions={[
          {
            key: 'spaces',
            options: [{ value: 'space-1', label: 'Space one', count: 1 }],
            values: [],
            onToggle: vi.fn(),
            onClear: vi.fn(),
            anyLabel: 'Any space',
            noun: ['space', 'spaces'],
          },
        ]}
        end={<button>Show hidden</button>}
      />
    );

    const dimension = screen.getByRole('button', { name: 'Any space' });
    const hidden = screen.getByRole('button', { name: 'Show hidden' });
    const rightControls = dimension.parentElement;

    expect(rightControls).toContainElement(hidden);
    expect([...rightControls!.children]).toEqual([dimension, hidden]);
    expect(rightControls).not.toContainElement(screen.getByRole('button', { name: 'Best' }));
  });
});
