import { Content, Root } from '@radix-ui/react-dialog';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEGREE_TYPES, FIELD_OF_STUDY_TYPE, SCHOOL_TYPES } from '~/core/profile/history-ontology';

import { AddEducationSheet } from './add-education-sheet';

let pickCount = 0;

vi.mock('~/design-system/select-entity', () => ({
  SelectEntity: ({
    relationValueTypes,
    autoFocus,
    deferCreate,
    inputLabelledBy,
    onDone,
  }: {
    relationValueTypes?: { id: string; name: string | null }[];
    autoFocus?: boolean;
    deferCreate?: boolean;
    inputLabelledBy?: string;
    onDone: (result: { id: string; name: string | null }, fromCreateFn?: boolean) => void;
  }) => (
    <div>
      <button
        type="button"
        data-scoped-to={relationValueTypes?.map(type => type.id).join(',') ?? ''}
        data-autofocus={autoFocus ? 'yes' : 'no'}
        data-defer-create={deferCreate ? 'yes' : 'no'}
        data-labelled-by={inputLabelledBy ?? ''}
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

/**
 * Rendered inside a dialog, which is where these sheets live: the heading and the
 * footer note are the dialog's accessible name and description, so they need
 * something to register with.
 */
function inDialog(sheet: React.ReactNode) {
  return (
    <Root open>
      <Content>{sheet}</Content>
    </Root>
  );
}

function renderSheet(overrides: Partial<Parameters<typeof AddEducationSheet>[0]> = {}) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    inDialog(
      <AddEducationSheet spaceId="space-1" isSaving={false} onCancel={onCancel} onSave={onSave} {...overrides} />
    )
  );
  return { onSave, onCancel };
}

const pickers = () => screen.getAllByRole('button', { name: /pick existing/ });

describe('AddEducationSheet', () => {
  it('needs a school and a degree before it can save', async () => {
    renderSheet();

    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();

    await userEvent.click(pickers()[0]); // school
    await userEvent.click(pickers()[0]); // degree

    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
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

  it('will not save a range that ends before it starts', async () => {
    renderSheet();

    await userEvent.click(pickers()[0]);
    await userEvent.click(pickers()[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Completed' }));
    await userEvent.selectOptions(screen.getByLabelText('Start month'), '6');
    await userEvent.selectOptions(screen.getByLabelText('Start year'), '2021');
    await userEvent.selectOptions(screen.getByLabelText('End month'), '3');
    await userEvent.selectOptions(screen.getByLabelText('End year'), '2019');

    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('The end date is before the start date.');
  });

  // The field was labelled "End (or expected)" and offered eight years ahead,
  // while being disabled by the one status where an expected date means
  // anything. It cannot be stored either: "Still studying" writes no status, so
  // the missing end date is the only thing saying a degree is unfinished.
  it('does not offer a graduation date that has not happened', () => {
    renderSheet();

    const nextYear = String(new Date().getUTCFullYear() + 1);
    const end = screen.getByLabelText('End year');

    expect(within(end).queryByRole('option', { name: nextYear })).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

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
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

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

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

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
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    const draft = props.onSave.mock.calls.at(-1)?.[0];
    expect(draft.fields).toEqual([{ id: 'new-field', name: 'Computer Science', isNew: true }]);
  });

  // A picker opened by clicking "+ Add another" should be ready to type in. The
  // ones showing because the list is empty must not be, or opening the sheet
  // yanks focus down the form.
  it('focuses a picker opened on demand, and no other', async () => {
    renderSheet();

    expect(pickers().map(picker => picker.dataset.autofocus)).toEqual(['no', 'no', 'no', 'no']);

    await userEvent.click(pickers()[0]); // school
    await userEvent.click(pickers()[0]); // degree
    await userEvent.click(pickers()[0]); // first field
    await userEvent.click(screen.getByRole('button', { name: '+ Add another' }));

    const focused = pickers().filter(picker => picker.dataset.autofocus === 'yes');
    expect(focused).toHaveLength(1);
  });

  it('focuses the skills picker opened on demand', async () => {
    renderSheet();

    await userEvent.click(pickers().at(-1)!); // the skills picker, shown while empty
    await userEvent.click(screen.getByRole('button', { name: '+ Add skill' }));

    expect(pickers().filter(picker => picker.dataset.autofocus === 'yes')).toHaveLength(1);
  });

  it('locks the school and reuses its record when adding a second degree there', async () => {
    const props = renderSheet({ school: { id: 'northumbria', name: 'Northumbria', stintId: 'record-1' } });

    expect(screen.getByText(/Already on your profile/)).toBeInTheDocument();

    await userEvent.click(pickers()[0]); // degree
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ existingStintId: 'record-1' }));
  });
});

describe('every picker', () => {
  // Creating through a picker used to name the entity in the store there and
  // then, so backing out of the sheet left the name behind on an entity nothing
  // pointed at. The sheet writes that name itself when the modal saves.
  it('leaves the writing to the modal’s save', () => {
    renderSheet();

    for (const picker of pickers()) expect(picker).toHaveAttribute('data-defer-create', 'yes');
  });

  // The search box is not inside a `<label>`, so without this it is announced by
  // its placeholder — "Example: Stanford University" where the field says School.
  it('is named by the label above it', () => {
    renderSheet();

    for (const picker of pickers()) {
      const labelId = picker.getAttribute('data-labelled-by');
      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId as string)?.textContent).toBeTruthy();
    }
  });
});
