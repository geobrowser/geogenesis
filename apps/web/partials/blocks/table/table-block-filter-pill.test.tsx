import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TableBlockFilterGroupPill } from './table-block-filter-pill';

describe('TableBlockFilterGroupPill', () => {
  it('lets non-editors remove temporary filters but not persisted filters', async () => {
    const onDeleteValue = vi.fn();

    render(
      <TableBlockFilterGroupPill
        group={{
          columnId: 'status',
          columnName: 'Status',
          filters: [
            {
              filter: {
                columnId: 'status',
                columnName: 'Status',
                valueType: 'TEXT',
                value: 'Published',
                valueName: null,
              },
              originalIndex: 0,
            },
            {
              filter: {
                columnId: 'status',
                columnName: 'Status',
                valueType: 'TEXT',
                value: 'Draft',
                valueName: null,
              },
              originalIndex: 1,
            },
          ],
        }}
        mode="OR"
        onToggleMode={vi.fn()}
        onDeleteValue={onDeleteValue}
        isEditing={false}
        serverFilterKeys={new Set(['status:Published'])}
      />
    );

    expect(screen.queryByLabelText('Remove Published value')).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Remove Draft value'));

    expect(onDeleteValue).toHaveBeenCalledWith(1);
  });

  it('styles relation filter values differently from text filter values', () => {
    render(
      <TableBlockFilterGroupPill
        group={{
          columnId: 'type',
          columnName: 'Type',
          filters: [
            {
              filter: {
                columnId: 'type',
                columnName: 'Type',
                valueType: 'RELATION',
                value: 'type-id',
                valueName: 'Place',
              },
              originalIndex: 0,
            },
            {
              filter: {
                columnId: 'type',
                columnName: 'Type',
                valueType: 'TEXT',
                value: 'Venue',
                valueName: null,
              },
              originalIndex: 1,
            },
          ],
        }}
        mode="OR"
        onToggleMode={vi.fn()}
        onDeleteValue={vi.fn()}
        isEditing={false}
        serverFilterKeys={new Set()}
      />
    );

    expect(screen.getByText('Place').parentElement).toHaveClass('bg-white');
    expect(screen.getByText('Venue').parentElement).toHaveClass('bg-grey-01');
  });
});
