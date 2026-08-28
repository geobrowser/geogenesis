import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import type { PersonRecord } from './person-record';
import { PersonRecordLine } from './person-record-line';

const FULL: PersonRecord = {
  positions: 119,
  debatesArgued: 11,
  winRate: { percent: 73, wins: 8, of: 11 },
  joinedAt: new Date(Date.UTC(2026, 0, 29)),
};

function line(over: Partial<PersonRecord> = {}) {
  return render(<PersonRecordLine record={{ ...FULL, ...over }} />);
}

afterEach(cleanup);

describe('PersonRecordLine', () => {
  it('shows the three counts and the join date', () => {
    const { container } = line();

    expect(container).toHaveTextContent('119');
    expect(container).toHaveTextContent('11');
    expect(container).toHaveTextContent('73%');
    expect(screen.getByText('On Geo since Jan 2026')).toBeInTheDocument();
  });

  // An icon beside a bare number means nothing to a screen reader, so each stat carries real label
  // text rather than only a `title`.
  it('names every stat for a screen reader', () => {
    line();

    expect(screen.getByText('119 positions')).toBeInTheDocument();
    expect(screen.getByText('11 debates')).toBeInTheDocument();
    expect(screen.getByText('Won 8 of 11 debates')).toBeInTheDocument();
  });

  it('says "1 position" rather than "1 positions"', () => {
    line({ positions: 1, debatesArgued: 1, winRate: { percent: 100, wins: 1, of: 1 } });

    expect(screen.getByText('1 position')).toBeInTheDocument();
    expect(screen.getByText('1 debate')).toBeInTheDocument();
    expect(screen.getByText('Won 1 of 1 debate')).toBeInTheDocument();
  });

  // "0 debates · 0% won" reads as failure; absence reads as new.
  it('leaves out the stats a newcomer has none of, keeping the join date', () => {
    const { container } = line({ positions: null, debatesArgued: null, winRate: null });

    // No stat list at all, rather than a list of noughts.
    expect(container.querySelector('ul')).toBeNull();
    expect(screen.queryByText(/positions?$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/debates?$/)).not.toBeInTheDocument();
    expect(screen.getByText('On Geo since Jan 2026')).toBeInTheDocument();
  });

  it('drops just the win rate when only that is missing', () => {
    line({ winRate: null });

    expect(screen.getByText('119 positions')).toBeInTheDocument();
    expect(screen.queryByText(/^Won /)).not.toBeInTheDocument();
  });

  it('renders nothing at all when there is nothing to say', () => {
    const { container } = line({ positions: null, debatesArgued: null, winRate: null, joinedAt: null });

    expect(container).toBeEmptyDOMElement();
  });
});
