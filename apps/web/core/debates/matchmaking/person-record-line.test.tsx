import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import type { PersonRecord } from './person-record';
import { PersonRecordLine } from './person-record-line';

const FULL: PersonRecord = {
  positions: 119,
  debatesArgued: 11,
  activeSpaceIds: new Set(),
  joinedAt: new Date(Date.UTC(2026, 0, 29)),
};

function line(over: Partial<PersonRecord> = {}, match?: ReactNode) {
  return render(<PersonRecordLine record={{ ...FULL, ...over }} match={match} />);
}

afterEach(cleanup);

describe('PersonRecordLine', () => {
  it('shows debates, positions and the join date without a win percentage', () => {
    const { container } = line();

    expect(container).toHaveTextContent('119');
    expect(container).toHaveTextContent('11');
    expect(container).not.toHaveTextContent('73%');
    expect(screen.getByText('On Geo since Jan 2026')).toBeInTheDocument();
  });

  // An icon beside a bare number means nothing to a screen reader, so each stat carries real label
  // text rather than only a `title`.
  it('names both stats for a screen reader', () => {
    line();

    expect(screen.getByText('119 positions')).toBeInTheDocument();
    expect(screen.getByText('11 debates')).toBeInTheDocument();
    expect(screen.queryByText(/^Won /)).not.toBeInTheDocument();
  });

  it('says "1 position" rather than "1 positions"', () => {
    line({ positions: 1, debatesArgued: 1 });

    expect(screen.getByText('1 position')).toBeInTheDocument();
    expect(screen.getByText('1 debate')).toBeInTheDocument();
  });

  // A row of zeroes reads as failure; absence reads as new.
  it('leaves out the stats a newcomer has none of, keeping the join date', () => {
    const { container } = line({ positions: null, debatesArgued: null });

    // No stat list at all, rather than a list of noughts.
    expect(container.querySelector('ul')).toBeNull();
    expect(screen.queryByText(/positions?$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/debates?$/)).not.toBeInTheDocument();
    expect(screen.getByText('On Geo since Jan 2026')).toBeInTheDocument();
  });

  it('orders debates, positions, a dot and matches on one non-wrapping row', () => {
    const { container } = line({}, <button type="button">13 matches</button>);
    const stats = container.querySelector('ul')!;
    const text = stats.textContent ?? '';

    expect(stats).toHaveClass('flex-nowrap', 'whitespace-nowrap', 'gap-x-1.5');
    expect(stats).not.toHaveClass('flex-wrap');
    expect(text.indexOf('11')).toBeLessThan(text.indexOf('119'));
    expect(text.indexOf('119')).toBeLessThan(text.indexOf('·'));
    expect(text.indexOf('·')).toBeLessThan(text.indexOf('13 matches'));
  });

  it('can show matches without a record or separator', () => {
    const { container } = render(<PersonRecordLine record={null} match={<button type="button">1 match</button>} />);

    expect(screen.getByRole('button', { name: '1 match' })).toBeInTheDocument();
    expect(container).not.toHaveTextContent('·');
  });

  it('renders nothing at all when there is nothing to say', () => {
    const { container } = line({ positions: null, debatesArgued: null, joinedAt: null });

    expect(container).toBeEmptyDOMElement();
  });
});
