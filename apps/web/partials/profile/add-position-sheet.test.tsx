import { Content, Root } from '@radix-ui/react-dialog';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EMPLOYER_TYPE, JOB_TYPE } from '~/core/profile/history-ontology';

import { AddPositionSheet } from './add-position-sheet';

const mocks = vi.hoisted(() => ({
  suggestions: [] as { id: string; name: string | null; isRequired: boolean; rank: number }[],
  suggestedFor: undefined as string | undefined,
  alreadyPicked: [] as string[],
}));

// The taxonomy read behind the suggestions. Stubbed to record what it was asked
// about, since which role the sheet asks for is the part this file owns.
vi.mock('~/core/hooks/use-suggested-skills', () => ({
  useSuggestedSkills: ({ roleId, picked }: { roleId: string | undefined; picked: string[] }) => {
    mocks.suggestedFor = roleId;
    mocks.alreadyPicked = picked;
    const forRole = roleId ? mocks.suggestions : [];
    return { suggestions: forRole.slice(0, 5), all: forRole, isLoading: false };
  },
}));

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
    pinnedResults,
    autoFocus,
    deferCreate,
    inputLabelledBy,
    onDone,
  }: {
    relationValueTypes?: { id: string; name: string | null }[];
    onCreateEntity?: (result: { id: string; name: string | null }) => void | string;
    pinnedResults?: { id: string; name: string | null }[];
    autoFocus?: boolean;
    deferCreate?: boolean;
    inputLabelledBy?: string;
    onDone: (result: { id: string; name: string | null }, fromCreateFn?: boolean) => void;
  }) => (
    <div>
      <button
        type="button"
        data-scoped-to={relationValueTypes?.map(type => type.id).join(',') ?? ''}
        data-can-create={onCreateEntity ? 'yes' : 'no'}
        data-pinned={(pinnedResults ?? []).map(result => result.name).join('|')}
        data-autofocus={autoFocus ? 'yes' : 'no'}
        data-defer-create={deferCreate ? 'yes' : 'no'}
        data-labelled-by={inputLabelledBy ?? ''}
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

afterEach(() => {
  cleanup();
  mocks.suggestions = [];
  mocks.suggestedFor = undefined;
  mocks.alreadyPicked = [];
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

function renderSheet(overrides: Partial<Parameters<typeof AddPositionSheet>[0]> = {}) {
  const props = {
    spaceId: 'space-1',
    onCancel: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
  render(inDialog(<AddPositionSheet {...props} />));
  return props;
}

const pickCompany = () => userEvent.click(screen.getAllByRole('button', { name: /pick existing/ })[0]);
const pickTitle = () => userEvent.click(screen.getAllByRole('button', { name: /pick existing/ })[0]);

/**
 * The start date, which every record needs before it can be saved.
 *
 * Required since GEO-2859: editing a published row is a removal and a fresh
 * write, and the write emits no date row when it has none — so saving with the
 * start blank deleted the date that was there.
 */
async function pickStart(month = '3', year = '2019') {
  await userEvent.selectOptions(screen.getByLabelText('Start month'), month);
  await userEvent.selectOptions(screen.getByLabelText('Start year'), year);
}

describe('AddPositionSheet', () => {
  it('cannot save until the company, the title and the start date are answered', async () => {
    renderSheet();

    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();

    await pickCompany();
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();

    await pickTitle();
    // Saving here used to be allowed, and on an edit it deleted the date the
    // row already had — the write emits no date row when it has none.
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a start month and year.');

    await pickStart();
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  });

  it('refuses a half-filled start date, which is what the month dropdown leaves behind', async () => {
    renderSheet();

    await pickCompany();
    await pickTitle();
    // A month with no year is not a date. The field reports nothing until both
    // are chosen, and that nothing used to save.
    await userEvent.selectOptions(screen.getByLabelText('Start month'), '3');

    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
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
    await pickStart();
    await userEvent.selectOptions(screen.getByLabelText('End month'), '1');
    await userEvent.selectOptions(screen.getByLabelText('End year'), '2021');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

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
    await pickStart();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    // The end date the picker was left showing is discarded rather than published
    // alongside a claim that the role is current.
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ status: 'current', endDate: null }));
  });

  it('marks a new company so it gets named and typed on save', async () => {
    const props = renderSheet();

    await userEvent.click(screen.getAllByRole('button', { name: /create new/ })[0]);
    await pickTitle();
    await pickStart();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

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
    await pickStart();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

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
      location: { id: 'city-sf', name: 'San Francisco', isNew: false },
      locationType: { id: 'loc-remote', name: 'Remote' },
      startDate: '2022-06-01Z',
      endDate: null,
      status: 'current' as const,
      description: 'Here are some highlights',
    };

    it('opens with the row already in it', () => {
      renderSheet({ initial });

      expect(screen.getByRole('heading', { name: 'Edit role' })).toBeInTheDocument();
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
      await userEvent.click(screen.getAllByRole('button', { name: /^Change / })[0]!);
      await userEvent.click(screen.getAllByRole('button', { name: /pick existing/ })[0]);
      await pickStart();
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));

      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({ company: { id: 'picked-id', name: 'Coinbase', isNew: false } })
      );
    });

    it('hands back everything it was given when nothing is touched', async () => {
      const props = renderSheet({ initial });

      // No start date picked: the row arrived with one, so Done is already
      // available and touching the field would defeat the point of the test.
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));

      expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining(initial));
    });
  });

  describe('location', () => {
    it('saves the city and the arrangement onto the position', async () => {
      const props = renderSheet();

      await pickCompany();
      await pickTitle();
      // The location picker is the next unanswered one.
      await userEvent.click(screen.getAllByRole('button', { name: /pick existing/ })[0]);
      await userEvent.selectOptions(screen.getByLabelText('Location type'), 'Remote');
      await pickStart();
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));

      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          location: { id: 'picked-id', name: 'Coinbase', isNew: false },
          locationType: { id: '8f5e23aa70394ea4b7946fa0a9878da7', name: 'Remote' },
        })
      );
    });

    // Optional on LinkedIn and optional here.
    it('leaves both unanswered rather than guessing', async () => {
      const props = renderSheet();

      await pickCompany();
      await pickTitle();
      await pickStart();
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));

      expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ location: null, locationType: null }));
    });

    it('offers the three arrangements the graph records', () => {
      renderSheet();

      for (const option of ['Onsite', 'Hybrid', 'Remote']) {
        expect(screen.getByRole('option', { name: option })).toBeInTheDocument();
      }
    });
  });

  describe('skills suggested for the role', () => {
    const suggestion = (name: string) => ({ id: `skill-${name}`, name, isRequired: true, rank: 3 });

    it('asks about the role only once one has been picked', async () => {
      renderSheet();

      expect(mocks.suggestedFor).toBeUndefined();

      await pickCompany();
      await pickTitle();

      expect(mocks.suggestedFor).toBe('picked-id');
    });

    // Marked as existing rather than new: the taxonomy owns these entities, and
    // minting a second `Debug software` is exactly what suggesting them avoids.
    it('adds a suggestion to the draft as an existing entity', async () => {
      mocks.suggestions = [suggestion('Debug software')];
      const props = renderSheet();

      await pickCompany();
      await pickTitle();
      await userEvent.click(screen.getByRole('button', { name: '+ Debug software' }));
      await pickStart();
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));

      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          skills: [{ id: 'skill-Debug software', name: 'Debug software', isNew: false }],
        })
      );
    });

    it('tells the reader what is already on the draft so it is not offered again', async () => {
      mocks.suggestions = [suggestion('Debug software')];
      renderSheet();

      await pickCompany();
      await pickTitle();
      await userEvent.click(screen.getByRole('button', { name: '+ Debug software' }));

      expect(mocks.alreadyPicked).toEqual(['skill-Debug software']);
    });

    // A job title somebody typed in themselves has no taxonomy behind it, and an
    // empty row would read as something failing to load.
    it('shows nothing at all when the role has no skills', async () => {
      renderSheet();

      await pickCompany();
      await pickTitle();

      expect(screen.queryByText('Common for this role')).not.toBeInTheDocument();
    });

    // Five pills are a shortcut past searching, not the set. A product manager
    // has dozens recorded, so choosing from five meant choosing from whichever
    // five ranked highest — the rest have to be reachable without guessing at a
    // search term.
    it('offers every skill for the role inside the picker, not just the five pills', async () => {
      mocks.suggestions = Array.from({ length: 9 }, (_, index) => suggestion(`Skill ${index}`));
      renderSheet();

      await pickCompany();
      await pickTitle();

      expect(screen.getAllByRole('button', { name: /^\+ Skill/ })).toHaveLength(5);

      const pinned = screen.getAllByRole('button', { name: /pick existing/ }).map(picker => picker.dataset.pinned);
      expect(pinned).toContain(Array.from({ length: 9 }, (_, index) => `Skill ${index}`).join('|'));
    });
  });

  // A picker opened by clicking "+ Add skill" should be ready to type in; the
  // ones showing because nothing is filled in yet must not steal focus.
  it('focuses the skills picker opened on demand, and no other', async () => {
    renderSheet();

    expect(screen.getAllByRole('button', { name: /pick existing/ }).every(p => p.dataset.autofocus === 'no')).toBe(
      true
    );

    await pickCompany();
    await pickTitle();
    await userEvent.click(screen.getAllByRole('button', { name: /pick existing/ }).at(-1)!); // skills
    await userEvent.click(screen.getByRole('button', { name: '+ Add skill' }));

    const focused = screen
      .getAllByRole('button', { name: /pick existing/ })
      .filter(picker => picker.dataset.autofocus === 'yes');
    expect(focused).toHaveLength(1);
  });

  // Nothing here publishes — the draft goes back to the modal, which does.
  // The renderer refuses to show a negative duration, which only hid the problem:
  // the backwards range still reached the graph.
  it('will not save a range that ends before it starts', async () => {
    renderSheet();

    await pickCompany();
    await pickTitle();
    await userEvent.selectOptions(screen.getByLabelText('Start month'), '6');
    await userEvent.selectOptions(screen.getByLabelText('Start year'), '2021');
    await userEvent.selectOptions(screen.getByLabelText('End month'), '3');
    await userEvent.selectOptions(screen.getByLabelText('End year'), '2019');

    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('The end date is before the start date.');
  });

  // A role still held writes no end date, so whatever the picker was left showing
  // cannot be backwards.
  it('ignores a stale end date once the role is marked current', async () => {
    renderSheet();

    await pickCompany();
    await pickTitle();
    await userEvent.selectOptions(screen.getByLabelText('Start month'), '6');
    await userEvent.selectOptions(screen.getByLabelText('Start year'), '2021');
    await userEvent.selectOptions(screen.getByLabelText('End month'), '3');
    await userEvent.selectOptions(screen.getByLabelText('End year'), '2019');
    await userEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  });

  it('says what Done actually does', () => {
    renderSheet();

    expect(screen.getByText('Added to your profile when you save it.')).toBeInTheDocument();
    expect(screen.queryByText(/publishes to your space/i)).not.toBeInTheDocument();
  });
});

describe('every picker', () => {
  const pickers = () => screen.getAllByRole('button', { name: /pick existing/ });

  // Creating through a picker used to name the entity in the store there and
  // then, so backing out of the sheet left the name behind on an entity nothing
  // pointed at. The sheet writes that name itself when the modal saves.
  it('leaves the writing to the modal’s save', () => {
    renderSheet();

    for (const picker of pickers()) expect(picker).toHaveAttribute('data-defer-create', 'yes');
  });

  // The search box is not inside a `<label>`, so without this it is announced by
  // its placeholder — "Example: Microsoft" where the field says Company.
  it('is named by the label above it', () => {
    renderSheet();

    for (const picker of pickers()) {
      const labelId = picker.getAttribute('data-labelled-by');
      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId as string)?.textContent).toBeTruthy();
    }
  });
});

/**
 * A company typed into this modal does not exist until the modal saves, and the
 * row that writes its name is whichever one ends up being published. A second
 * role added at that same card therefore has to carry the flag too — asserting
 * `isNew: false` published an Employment relation pointing at an entity nothing
 * had ever named, which could not then be searched for to repair.
 */
describe('a company created in this modal', () => {
  it('keeps needing its name written when a second role is added there', async () => {
    const { onSave } = renderSheet({
      company: { id: 'org-acme', name: 'Acme', stintId: 'stint-acme', isNew: true },
    });

    await userEvent.click(screen.getAllByRole('button', { name: /pick existing/ })[0]!);
    await pickStart();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ company: expect.objectContaining({ isNew: true }) }));
  });

  it('does not claim that of a company already on the graph', async () => {
    const { onSave } = renderSheet({
      company: { id: 'org-geo', name: 'Geo', stintId: 'stint-geo' },
    });

    await userEvent.click(screen.getAllByRole('button', { name: /pick existing/ })[0]!);
    await pickStart();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ company: expect.objectContaining({ isNew: false }) })
    );
  });
});

describe('the Change button beside a chosen entity', () => {
  // Every picker renders one, so "Change" alone named Company, Title and
  // Location identically.
  it('says which field it changes', async () => {
    renderSheet();

    await userEvent.click(screen.getAllByRole('button', { name: /pick existing/ })[0]!);

    expect(screen.getByRole('button', { name: 'Change Company' })).toBeInTheDocument();
  });
});

/**
 * ...except on a row that never had one (GEO-2859).
 *
 * Editing is a removal and a fresh write, so a blank start *deletes* a date that
 * was there — which is what the requirement above is for. A row that arrived
 * undated has nothing to delete, and **1,739 of the graph's 1,906 employment
 * rows carry no date at all**, so requiring one there made the ordinary legacy
 * record unsavable: correcting a typo in the title meant inventing a historical
 * start.
 */
describe('AddPositionSheet — a row that was already undated', () => {
  it('lets an undated row be saved without inventing a date', async () => {
    renderSheet({
      initial: {
        company: { id: 'org-1', name: 'Geo' },
        title: { id: 'role-1', name: 'Head of Product' },
        startDate: null,
        endDate: null,
        status: 'current',
        skills: [],
      } as never,
    });

    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  });

  it('still refuses to let a dated row have its date cleared', async () => {
    renderSheet({
      initial: {
        company: { id: 'org-1', name: 'Geo' },
        title: { id: 'role-1', name: 'Head of Product' },
        startDate: '2019-03-01T00:00:00.000Z',
        endDate: null,
        status: 'current',
        skills: [],
      } as never,
    });

    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();

    await userEvent.selectOptions(screen.getByLabelText('Start month'), '');

    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
  });

  it('still requires a date on a brand new row', async () => {
    renderSheet();

    await pickCompany();
    await pickTitle();

    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
  });
});
