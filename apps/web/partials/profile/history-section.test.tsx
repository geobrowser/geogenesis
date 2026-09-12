import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EmploymentCard } from '~/core/profile/normalize-history';
import { NOTHING_TO_CLEAN } from '~/core/profile/pending-history';

import { HistorySection } from './history-section';

afterEach(cleanup);

type Entry = EmploymentCard['entries'][number];

const entry = (name: string, startDate: string | null, endDate: string | null, org = 'Geo'): Entry => ({
  relationId: `rel-${name}`,
  tenureId: `tenure-${name}`,
  edge: { relationId: `edge-${org}`, stintId: `stint-${org}`, subtree: NOTHING_TO_CLEAN },
  subtree: NOTHING_TO_CLEAN,
  subject: { id: `subject-${name}`, name },
  startDate,
  endDate,
  description: null,
  isLegacy: false,
  status: null,
  employmentType: null,
  skills: [],
  location: null,
  locationType: null,
});

const card = (org: string, entries: ReturnType<typeof entry>[]): EmploymentCard => ({
  organization: { id: `org-${org}`, name: org },
  edges: [{ relationId: `edge-${org}`, stintId: `stint-${org}`, subtree: NOTHING_TO_CLEAN }],
  entries,
});

function renderSection(cards: EmploymentCard[] = [], overrides: Partial<Parameters<typeof HistorySection>[0]> = {}) {
  const props = {
    kind: 'employment' as const,
    cards,
    onAdd: vi.fn(),
    onAddTo: vi.fn(),
    onEditEntry: vi.fn(),
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
    expect(screen.getByText(/Jan 2024 – Present/)).toBeInTheDocument();
    expect(screen.getByText(/Jun 2022 – Jan 2024/)).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole('button', { name: 'Remove position Engineer' }));

    expect(props.onRemoveEntry).toHaveBeenCalledWith(cards[0], cards[0].entries[1]);
  });

  // Everything on a row was typed into the sheet, so the row is the way back to it.
  it('opens the row that was clicked for editing', async () => {
    const cards = [card('Geo', [entry('Product Lead', '2024-01-01Z', null), entry('Engineer', '2022-06-01Z', null)])];
    const props = renderSection(cards);

    await userEvent.click(screen.getByRole('button', { name: 'Edit position Engineer' }));

    expect(props.onEditEntry).toHaveBeenCalledWith(cards[0], cards[0].entries[1]);
    expect(props.onRemoveEntry).not.toHaveBeenCalled();
  });

  // A card-level "Remove employer" sat beside this and did exactly the same work
  // on a card with one role, which read as two different things.
  it('offers removal on the row and nowhere else', () => {
    renderSection([card('Geo', [entry('Engineer', '2022-06-01Z', null)])]);

    expect(screen.getByRole('button', { name: 'Remove position Engineer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove employer/ })).not.toBeInTheDocument();
  });

  // About a third of records carry no dates. A lone dash reads as a rendering
  // fault rather than as missing data.
  it('shows no date line at all when a row has no dates', () => {
    renderSection([card('Apple', [entry('Engineer', null, null, 'Apple')])]);

    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.queryByText('–')).not.toBeInTheDocument();
  });

  // One line the way a CV states it, and either half stands on its own: a remote
  // role need not name a city, and a city says something without an arrangement
  // beside it.
  it('reads the location and the working arrangement as one line', () => {
    const row = entry('Engineer', '2022-06-01Z', null);
    renderSection([
      card('Geo', [
        { ...row, location: { id: 'city-sf', name: 'San Francisco' }, locationType: { id: 'r', name: 'Remote' } },
      ]),
    ]);

    expect(screen.getByText('San Francisco · Remote')).toBeInTheDocument();
  });

  it('shows whichever half it has', () => {
    const row = entry('Engineer', '2022-06-01Z', null);
    renderSection([card('Geo', [{ ...row, locationType: { id: 'r', name: 'Remote' } }])]);

    expect(screen.getByText('Remote')).toBeInTheDocument();
  });

  it('locks every control while a save is in flight', () => {
    renderSection([card('Geo', [entry('Engineer', '2022-06-01Z', null)])], { disabled: true });

    expect(screen.getByRole('button', { name: '+ Add position' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Add another role here' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit position Engineer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove position Engineer' })).toBeDisabled();
  });

  it('uses the education wording for the education section', () => {
    renderSection([], { kind: 'education' });

    expect(screen.getByRole('heading', { name: 'Education' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add education' })).toBeInTheDocument();
  });
});
