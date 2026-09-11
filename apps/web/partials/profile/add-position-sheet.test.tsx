import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EMPLOYER_TYPE, JOB_TYPE } from '~/core/profile/history-ontology';

import { AddPositionSheet } from './add-position-sheet';

/**
 * `SelectEntity` is a search box over the graph. Stubbed down to the three things
 * this sheet depends on: which types it was scoped to, whether the result came
 * back as an existing entity or one the user is creating, and whether it was
 * handed an `onCreateEntity` — the prop whose presence is what makes the real
 * component offer "Create new" at all.
 */
vi.mock('~/design-system/select-entity', () => ({
  SelectEntity: ({
    relationValueTypes,
    onCreateEntity,
    onDone,
  }: {
    relationValueTypes?: { id: string; name: string | null }[];
    onCreateEntity?: (result: { id: string; name: string | null }) => void | string;
    onDone: (result: { id: string; name: string | null }, fromCreateFn?: boolean) => void;
  }) => (
    <div>
      <button
        type="button"
        data-scoped-to={relationValueTypes?.map(type => type.id).join(',') ?? ''}
        data-can-create={onCreateEntity ? 'yes' : 'no'}
        onClick={() => onDone({ id: 'picked-id', name: 'Coinbase' })}
      >
        pick existing
      </button>
      <button type="button" onClick={() => onDone({ id: 'new-id', name: 'Fathom' }, true)}>
        create new
      </button>
    </div>
  ),
}));

afterEach(cleanup);

function renderSheet(overrides: Partial<Parameters<typeof AddPositionSheet>[0]> = {}) {
  const props = {
    spaceId: 'space-1',
    isSaving: false,
    onCancel: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
  render(<AddPositionSheet {...props} />);
  return props;
}

const pickCompany = () => userEvent.click(screen.getAllByRole('button', { name: /pick existing/ })[0]);
const pickTitle = () => userEvent.click(screen.getAllByRole('button', { name: /pick existing/ })[0]);

describe('AddPositionSheet', () => {
  it('cannot save until both the company and the title are answered', async () => {
    renderSheet();

    expect(screen.getByRole('button', { name: 'Save position' })).toBeDisabled();

    await pickCompany();
    expect(screen.getByRole('button', { name: 'Save position' })).toBeDisabled();

    await pickTitle();
    expect(screen.getByRole('button', { name: 'Save position' })).toBeEnabled();
  });

  it('scopes each picker to the type it should search', () => {
    renderSheet();

    const scopes = screen.getAllByRole('button', { name: /pick existing/ }).map(b => b.getAttribute('data-scoped-to'));
    expect(scopes).toContain(EMPLOYER_TYPE);
    expect(scopes).toContain(JOB_TYPE);
  });

  it('saves the four answers as a position', async () => {
    const props = renderSheet();

    await pickCompany();
    await pickTitle();
    await userEvent.selectOptions(screen.getByLabelText('Start month'), '3');
    await userEvent.selectOptions(screen.getByLabelText('Start year'), '2019');
    await userEvent.selectOptions(screen.getByLabelText('End month'), '1');
    await userEvent.selectOptions(screen.getByLabelText('End year'), '2021');
    await userEvent.click(screen.getByRole('button', { name: 'Save position' }));

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        company: { id: 'picked-id', name: 'Coinbase', isNew: false },
        title: { id: 'picked-id', name: 'Coinbase', isNew: false },
        startDate: '2019-03-01Z',
        endDate: '2021-01-01Z',
        status: 'former',
      })
    );
  });

  // Current and Former are a clean pair, so work gets a checkbox rather than the
  // three-way control education needs.
  it('writes a role still held as current with no end date', async () => {
    const props = renderSheet();

    await pickCompany();
    await pickTitle();
    await userEvent.selectOptions(screen.getByLabelText('End month'), '1');
    await userEvent.selectOptions(screen.getByLabelText('End year'), '2021');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Save position' }));

    // The end date the picker was left showing is discarded rather than published
    // alongside a claim that the role is current.
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ status: 'current', endDate: null }));
  });

  it('marks a new company so it gets named and typed on save', async () => {
    const props = renderSheet();

    await userEvent.click(screen.getAllByRole('button', { name: /create new/ })[0]);
    await pickTitle();
    await userEvent.click(screen.getByRole('button', { name: 'Save position' }));

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ company: { id: 'new-id', name: 'Fathom', isNew: true } })
    );
  });

  // The promotion case: same sheet, company answered and locked, three fields left.
  it('locks the company and reuses its stint when adding a second role there', async () => {
    const props = renderSheet({ company: { id: 'coinbase', name: 'Coinbase', stintId: 'stint-1' } });

    expect(screen.getByText('Coinbase')).toBeInTheDocument();
    expect(screen.getByText(/Already on your profile/)).toBeInTheDocument();

    await pickTitle();
    await userEvent.click(screen.getByRole('button', { name: 'Save position' }));

    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ existingStintId: 'stint-1' }));
  });

  // The real component's "Create new" footer renders only where an
  // `onCreateEntity` was supplied, so without it these pickers could find a
  // company only if somebody else had already entered it.
  it('offers find-or-create on every picker', () => {
    renderSheet();

    const pickers = screen.getAllByRole('button', { name: /pick existing/ });
    expect(pickers.length).toBeGreaterThan(0);
    expect(pickers.every(picker => picker.getAttribute('data-can-create') === 'yes')).toBe(true);
  });

  // Ticking it is what leaves the End picker with nothing to say, so it has to be
  // read before End rather than after it.
  it('asks whether the role is current before asking when it ended', () => {
    renderSheet();

    const isCurrent = screen.getByRole('checkbox');
    const end = screen.getByLabelText('End month');

    expect(isCurrent.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  describe('editing an existing row', () => {
    const initial = {
      company: { id: 'org-geo', name: 'Geo', isNew: false },
      title: { id: 'title-engineer', name: 'Engineer', isNew: false },
      employmentType: null,
      skills: [{ id: 'skill-1', name: 'Product development', isNew: false }],
      startDate: '2022-06-01Z',
      endDate: null,
      status: 'current' as const,
      description: 'Here are some highlights',
    };

    it('opens with the row already in it', () => {
      renderSheet({ initial });

      expect(screen.getByRole('heading', { name: 'Edit position' })).toBeInTheDocument();
      expect(screen.getByText('Geo')).toBeInTheDocument();
      expect(screen.getByText('Engineer')).toBeInTheDocument();
      expect(screen.getByText('Product development')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Here are some highlights')).toBeInTheDocument();
      expect(screen.getByLabelText('Start month')).toHaveValue('6');
      expect(screen.getByLabelText('Start year')).toHaveValue('2022');
      expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    });

    // Unlike the promotion case, where the company is the one thing already
    // answered: a row opened to be corrected may be at the wrong company.
    it('lets the company be changed', async () => {
      const props = renderSheet({ initial });

      // The company's, which is the first of the two — the title has one too.
      await userEvent.click(screen.getAllByRole('button', { name: 'Change' })[0]);
      await userEvent.click(screen.getAllByRole('button', { name: /pick existing/ })[0]);
      await userEvent.click(screen.getByRole('button', { name: 'Save position' }));

      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({ company: { id: 'picked-id', name: 'Coinbase', isNew: false } })
      );
    });

    it('hands back everything it was given when nothing is touched', async () => {
      const props = renderSheet({ initial });

      await userEvent.click(screen.getByRole('button', { name: 'Save position' }));

      expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining(initial));
    });
  });

  it('says what the wait is and locks the controls while saving', () => {
    renderSheet({ isSaving: true });

    expect(screen.getByText(/about 10 seconds/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saving' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
