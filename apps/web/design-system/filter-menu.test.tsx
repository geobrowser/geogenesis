import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FilterMenu } from './filter-menu';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

afterEach(cleanup);

const options = [
  { key: 'easy', label: 'Easy', count: 4 },
  { key: 'medium', label: 'Medium', count: 1 },
  { key: 'hard', label: 'Hard', count: 0, disabled: true },
];

describe('FilterMenu', () => {
  it('single-select: shows a check on the selected option, counts, and closes after selecting', () => {
    const onSelect = vi.fn();
    render(<FilterMenu label="Any difficulty" options={options} selectedKey="medium" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Any difficulty' }));
    const medium = screen.getByRole('menuitemradio', { name: /Medium/ });
    expect(medium).toHaveAttribute('aria-checked', 'true');
    expect(within(medium).getByTestId('filter-count')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Easy/ }));
    expect(onSelect).toHaveBeenCalledWith('easy');
    expect(screen.queryByRole('menuitemradio', { name: /Easy/ })).not.toBeInTheDocument();
  });

  it('multi-select: checkbox rows, an All row, stays open, disabled rows are inert', () => {
    const onToggle = vi.fn();
    const onSelectAll = vi.fn();
    render(
      <FilterMenu
        label="Easy"
        multiple
        options={options}
        selectedKeys={new Set(['easy'])}
        onToggle={onToggle}
        allLabel="Any difficulty"
        onSelectAll={onSelectAll}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Easy' }));
    expect(screen.getByRole('menuitemcheckbox', { name: /Easy/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemcheckbox', { name: /Any difficulty/ })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Medium/ }));
    expect(onToggle).toHaveBeenCalledWith('medium');
    // Still open.
    expect(screen.getByRole('menuitemcheckbox', { name: /Medium/ })).toBeInTheDocument();
    const hard = screen.getByRole('menuitemcheckbox', { name: /Hard/ });
    expect(hard).toBeDisabled();
    fireEvent.click(hard);
    expect(onToggle).not.toHaveBeenCalledWith('hard');
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Any difficulty/ }));
    expect(onSelectAll).toHaveBeenCalled();
  });

  it('treats an empty selection as All when asked', () => {
    render(
      <FilterMenu
        label="Any skill"
        multiple
        options={options}
        selectedKeys={new Set()}
        onToggle={vi.fn()}
        allLabel="Any skill"
        emptyMeansAll
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Any skill' }));
    expect(screen.getByRole('menuitemcheckbox', { name: /Any skill/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('can render the SmallButton trigger', () => {
    render(<FilterMenu label="Sort" trigger="button" options={options} selectedKey={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Sort' })).toBeInTheDocument();
  });
});
