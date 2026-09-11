import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EmploymentCard } from '~/core/profile/normalize-history';

import { HistorySection } from './history-section';

afterEach(cleanup);

const entry = (name: string, startDate: string | null, endDate: string | null) => ({
  relationId: `rel-${name}`,
  tenureId: `tenure-${name}`,
  subject: { id: `subject-${name}`, name },
  startDate,
  endDate,
  description: null,
  isLegacy: false,
  status: null,
});

const card = (org: string, entries: ReturnType<typeof entry>[]): EmploymentCard => ({
  relationId: `edge-${org}`,
  stintId: `stint-${org}`,
  organization: { id: `org-${org}`, name: org },
  entries,
});

function renderSection(cards: EmploymentCard[] = [], overrides: Partial<Parameters<typeof HistorySection>[0]> = {}) {
  const props = {
    kind: 'employment' as const,
    cards,
    onAdd: vi.fn(),
    onAddTo: vi.fn(),
    onRemoveEntry: vi.fn(),
    ...overrides,
  };
  render(<HistorySection {...props} />);
  return props;
}

describe('HistorySection', () => {
  it('names the section and offers a way in when there is nothing yet', () => {
    renderSection();

    expect(screen.getByRole('heading', { name: 'Work' })).toBeInTheDocument();
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add position' })).toBeInTheDocument();
  });

  // The promotion case, and the only place the nesting shows: two roles under one
  // employer rather than the company repeated twice.
  it('shows one card per employer with every role under it', () => {
    renderSection([
      card('Geo', [entry('Product Lead', '2024-01-01Z', null), entry('Engineer', '2022-06-01Z', '2024-01-01Z')]),
    ]);

    const cards = screen.getAllByRole('listitem').filter(item => within(item).queryByText('Geo'));
    expect(cards).toHaveLength(1);

    expect(screen.getByText('Product Lead')).toBeInTheDocument();
    expect(screen.getByText('Jan 2024 – Present')).toBeInTheDocument();
    expect(screen.getByText('Jun 2022 – Jan 2024')).toBeInTheDocument();
  });

  // "Add another role here" is the entire disclosure of the level underneath.
  it('attaches a new role to the employer whose card it was clicked on', async () => {
    const cards = [card('Geo', [entry('Engineer', '2022-06-01Z', null)])];
    const props = renderSection(cards);

    await userEvent.click(screen.getByRole('button', { name: '+ Add another role here' }));

    expect(props.onAddTo).toHaveBeenCalledWith(cards[0]);
  });

  it('adds an unattached position from the section header', async () => {
    const props = renderSection([card('Geo', [entry('Engineer', '2022-06-01Z', null)])]);

    await userEvent.click(screen.getByRole('button', { name: '+ Add position' }));

    expect(props.onAdd).toHaveBeenCalled();
    expect(props.onAddTo).not.toHaveBeenCalled();
  });

  it('removes the row that was asked for', async () => {
    const cards = [card('Geo', [entry('Product Lead', '2024-01-01Z', null), entry('Engineer', '2022-06-01Z', null)])];
    const props = renderSection(cards);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Engineer' }));

    expect(props.onRemoveEntry).toHaveBeenCalledWith(cards[0], cards[0].entries[1]);
  });

  // About a third of records carry no dates. A lone dash reads as a rendering
  // fault rather than as missing data.
  it('shows no date line at all when a row has no dates', () => {
    renderSection([card('Apple', [entry('Engineer', null, null)])]);

    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.queryByText('–')).not.toBeInTheDocument();
  });

  it('locks every control while a save is in flight', () => {
    renderSection([card('Geo', [entry('Engineer', '2022-06-01Z', null)])], { disabled: true });

    expect(screen.getByRole('button', { name: '+ Add position' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Add another role here' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove Engineer' })).toBeDisabled();
  });

  it('uses the education wording for the education section', () => {
    renderSection([], { kind: 'education' });

    expect(screen.getByRole('heading', { name: 'Education' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add education' })).toBeInTheDocument();
  });
});
