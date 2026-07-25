import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataBlockExploreBrowseFilters } from './data-block-explore-browse-filters';

vi.mock('~/design-system/menu', () => ({
  Menu: ({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) => (
    <>
      {trigger}
      {children}
    </>
  ),
  MenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

afterEach(cleanup);

describe('DataBlockExploreBrowseFilters', () => {
  it('always shows time but hides the type menu without configured type filters', () => {
    render(
      <DataBlockExploreBrowseFilters
        time="all"
        onTimeChange={vi.fn()}
        typeOptions={[]}
        selectedTypeIds={[]}
        onToggleType={vi.fn()}
        onToggleAllTypes={vi.fn()}
      />
    );

    expect(screen.getAllByText('All time').length).toBeGreaterThan(0);
    expect(screen.queryByText('0 types')).toBeNull();
  });

  it('only lists configured types and forwards time and type actions', () => {
    const onTimeChange = vi.fn();
    const onToggleType = vi.fn();
    const onToggleAllTypes = vi.fn();

    render(
      <DataBlockExploreBrowseFilters
        time="month"
        onTimeChange={onTimeChange}
        typeOptions={[
          { id: 'type-a', label: 'Person' },
          { id: 'type-b', label: 'Project' },
        ]}
        selectedTypeIds={['type-a', 'type-b']}
        onToggleType={onToggleType}
        onToggleAllTypes={onToggleAllTypes}
      />
    );

    expect(screen.getByText('2 types')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Person/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Unselect all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Last year' }));

    expect(onToggleType).toHaveBeenCalledWith('type-a');
    expect(onToggleAllTypes).toHaveBeenCalledOnce();
    expect(onTimeChange).toHaveBeenCalledWith('year');
  });
});
