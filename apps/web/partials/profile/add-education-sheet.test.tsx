import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEGREE_TYPES, FIELD_OF_STUDY_TYPE, SCHOOL_TYPES } from '~/core/profile/history-ontology';

import { AddEducationSheet } from './add-education-sheet';

let pickCount = 0;

vi.mock('~/design-system/select-entity', () => ({
  SelectEntity: ({
    relationValueTypes,
    onDone,
  }: {
    relationValueTypes?: { id: string; name: string | null }[];
    onDone: (result: { id: string; name: string | null }, fromCreateFn?: boolean) => void;
  }) => (
    <div>
      <button
        type="button"
        data-scoped-to={relationValueTypes?.map(type => type.id).join(',') ?? ''}
        onClick={() => {
          pickCount += 1;
          onDone({ id: `picked-${pickCount}`, name: `Picked ${pickCount}` });
        }}
      >
        pick existing
      </button>
      <button type="button" onClick={() => onDone({ id: 'new-field', name: 'Computer Science' }, true)}>
        create new
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  pickCount = 0;
});

function renderSheet(overrides: Partial<Parameters<typeof AddEducationSheet>[0]> = {}) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(<AddEducationSheet spaceId="space-1" isSaving={false} onCancel={onCancel} onSave={onSave} {...overrides} />);
  return { onSave, onCancel };
}

const pickers = () => screen.getAllByRole('button', { name: /pick existing/ });

describe('AddEducationSheet', () => {
  it('needs a school and a degree before it can save', async () => {
    renderSheet();

    expect(screen.getByRole('button', { name: 'Save education' })).toBeDisabled();

    await userEvent.click(pickers()[0]); // school
    await userEvent.click(pickers()[0]); // degree

    expect(screen.getByRole('button', { name: 'Save education' })).toBeEnabled();
  });

  it('scopes the field picker to Field of study', () => {
    renderSheet();

    const scopes = pickers().map(button => button.getAttribute('data-scoped-to'));
    expect(scopes).toContain(FIELD_OF_STUDY_TYPE);
  });

  // Every picker scoped to what its property declares. School takes the pair,
  // since `Education` declares the broader of the two and most schools carry the
  // narrower one.
  it('scopes each picker to the type its property declares', () => {
    renderSheet();

    const scopes = pickers().map(button => button.getAttribute('data-scoped-to'));

    expect(scopes).toContain(SCHOOL_TYPES.join(','));
    expect(scopes).toContain(DEGREE_TYPES.join(','));
    expect(scopes).toContain(FIELD_OF_STUDY_TYPE);
    expect(scopes.filter(scope => scope === '')).toHaveLength(0);
  });

  it('offers the three states dates alone cannot express', () => {
    renderSheet();

    for (const label of ['Still studying', 'Completed', 'Did not finish']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  // There is no "in progress" option in the graph, and inventing one would be
  // worse than leaving it unsaid — the empty End date carries the meaning.
  it('saves still studying as no status and no end date', async () => {
    const props = renderSheet();

    await userEvent.click(pickers()[0]);
    await userEvent.click(pickers()[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Save education' }));

    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ status: 'studying', endDate: null }));
  });

  it('saves a finished degree with its status and dates', async () => {
    const props = renderSheet();

    await userEvent.click(pickers()[0]);
    await userEvent.click(pickers()[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Completed' }));
    await userEvent.selectOptions(screen.getByLabelText('Start month'), '9');
    await userEvent.selectOptions(screen.getByLabelText('Start year'), '2020');
    await userEvent.selectOptions(screen.getByLabelText('End month'), '6');
    await userEvent.selectOptions(screen.getByLabelText('End year'), '2022');
    await userEvent.click(screen.getByRole('button', { name: 'Save education' }));

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', startDate: '2020-09-01Z', endDate: '2022-06-01Z' })
    );
  });

  // A joint honours degree needs more than one, which is why it is a relation.
  it('collects more than one academic field', async () => {
    const props = renderSheet();

    await userEvent.click(pickers()[0]); // school
    await userEvent.click(pickers()[0]); // degree
    await userEvent.click(pickers()[0]); // first field

    await userEvent.click(screen.getByRole('button', { name: '+ Add another' }));
    await userEvent.click(pickers()[0]); // second field

    await userEvent.click(screen.getByRole('button', { name: 'Save education' }));

    const draft = props.onSave.mock.calls.at(-1)?.[0];
    expect(draft.fields).toHaveLength(2);
  });

  it('marks a field the user typed so it becomes a Field of study others can find', async () => {
    const props = renderSheet();

    await userEvent.click(pickers()[0]);
    await userEvent.click(pickers()[0]);
    // School and Degree are answered, so their pickers are gone; Field is the
    // first of the two left, with Skills behind it.
    await userEvent.click(screen.getAllByRole('button', { name: /create new/ })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Save education' }));

    const draft = props.onSave.mock.calls.at(-1)?.[0];
    expect(draft.fields).toEqual([{ id: 'new-field', name: 'Computer Science', isNew: true }]);
  });

  it('locks the school and reuses its record when adding a second degree there', async () => {
    const props = renderSheet({ school: { id: 'northumbria', name: 'Northumbria', stintId: 'record-1' } });

    expect(screen.getByText(/Already on your profile/)).toBeInTheDocument();

    await userEvent.click(pickers()[0]); // degree
    await userEvent.click(screen.getByRole('button', { name: 'Save education' }));

    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ existingStintId: 'record-1' }));
  });
});
