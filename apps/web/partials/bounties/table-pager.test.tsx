import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import { TablePager, usePagedRows } from './table-pager';

afterEach(cleanup);

function Harness({ rows }: { rows: number[] }) {
  const { pageRows, ...pager } = usePagedRows(rows);
  return (
    <div>
      <ul>
        {pageRows.map(row => (
          <li key={row}>row-{row}</li>
        ))}
      </ul>
      <TablePager {...pager} />
    </div>
  );
}

describe('usePagedRows / TablePager', () => {
  it('shows ten rows per page and walks pages with Next / Previous', () => {
    render(<Harness rows={Array.from({ length: 25 }, (_, i) => i + 1)} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByTestId('table-pager')).toHaveTextContent('1–10 of 25');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('row-11')).toBeInTheDocument();
    expect(screen.getByTestId('table-pager')).toHaveTextContent('11–20 of 25');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByTestId('table-pager')).toHaveTextContent('11–20 of 25');
  });

  it('renders no pager when everything fits on one page', () => {
    render(<Harness rows={[1, 2, 3]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByTestId('table-pager')).not.toBeInTheDocument();
  });

  it('returns to the first page when the row set changes', () => {
    const { rerender } = render(<Harness rows={Array.from({ length: 25 }, (_, i) => i + 1)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('row-11')).toBeInTheDocument();
    rerender(<Harness rows={Array.from({ length: 12 }, (_, i) => i + 100)} />);
    expect(screen.getByText('row-100')).toBeInTheDocument();
    expect(screen.getByTestId('table-pager')).toHaveTextContent('1–10 of 12');
  });
});
