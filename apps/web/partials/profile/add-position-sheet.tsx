'use client';

import * as React from 'react';

import { useSuggestedSkills } from '~/core/hooks/use-suggested-skills';
import { type MonthYear, fromGraphDate, toGraphDate } from '~/core/profile/history-dates';
import {
  EMPLOYER_TYPE,
  EMPLOYMENT_TYPE_OPTIONS,
  JOB_TYPE,
  LOCATION_TYPES,
  LOCATION_TYPE_OPTIONS,
  SKILL_TYPE,
  TAXONOMY_SPACE_ID,
} from '~/core/profile/history-ontology';
import type { EntityChoice, PositionDraft } from '~/core/profile/stage-history';

import { SmallButton } from '~/design-system/button';
import { Checkbox } from '~/design-system/checkbox';

import { EntityField, HistorySheet, MultiEntityField, OptionField, TextAreaField } from './history-sheet';
import { MonthYearField } from './month-year-field';

/**
 * Stable so it does not re-trigger the search on every render. The taxonomy is
 * in one space and it is not one the viewer belongs to, so both pickers have to
 * ask for it by name — see `TAXONOMY_SPACE_ID`.
 */
const TAXONOMY_SPACE_ID_LIST = [TAXONOMY_SPACE_ID];

/** Cities, regions and countries — see `LOCATION_TYPES` for why not addresses. */
const LOCATION_TYPE_FILTER = LOCATION_TYPES.map(id => ({ id, name: null }));

const EMPLOYER_FILTER = [{ id: EMPLOYER_TYPE, name: 'Project' }];

const JOB_FILTER = [{ id: JOB_TYPE, name: 'Person role' }];

const SKILL_FILTER = [{ id: SKILL_TYPE, name: 'Skill' }];

type Props = {
  spaceId: string;
  /** Pre-filled and locked when adding a second role at a company already listed. */
  company?: { id: string; name: string | null; stintId: string };
  /** The row being changed, when this is an edit rather than an addition. */
  initial?: PositionDraft;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (draft: PositionDraft) => void;
};

/**
 * Four questions, which become three relations, two entities and two or three
 * values. None of that appears here — that is the entire point.
 *
 * The same sheet edits a row as adds one: everything shown on a card was typed
 * in here, so there is nothing a separate edit form could offer that this one
 * does not already ask.
 */
export function AddPositionSheet({ spaceId, company, initial, isSaving, onCancel, onSave }: Props) {
  const locked = !initial && company ? { id: company.id, name: company.name, isNew: false } : null;

  const [pickedCompany, setPickedCompany] = React.useState<EntityChoice | null>(
    initial ? initial.company : (locked ?? null)
  );
  const [title, setTitle] = React.useState<EntityChoice | null>(initial?.title ?? null);
  const [start, setStart] = React.useState<MonthYear | null>(fromGraphDate(initial?.startDate));
  const [end, setEnd] = React.useState<MonthYear | null>(fromGraphDate(initial?.endDate));
  const [employmentType, setEmploymentType] = React.useState<{ id: string; name: string } | null>(
    initial?.employmentType ?? null
  );
  const [skills, setSkills] = React.useState<EntityChoice[]>(initial?.skills ?? []);
  const [location, setLocation] = React.useState<EntityChoice | null>(initial?.location ?? null);
  const [locationType, setLocationType] = React.useState<{ id: string; name: string } | null>(
    initial?.locationType ?? null
  );
  const [isCurrent, setIsCurrent] = React.useState(initial ? initial.status === 'current' : false);
  const [description, setDescription] = React.useState(initial?.description ?? '');

  const pickedSkillIds = React.useMemo(() => skills.map(skill => skill.id), [skills]);

  // Only occupations from the taxonomy carry these; a title somebody typed in
  // themselves has none, and neither the pills nor the pinned rows appear.
  const { suggestions, all: allForRole } = useSuggestedSkills({
    roleId: title?.id,
    picked: pickedSkillIds,
  });

  /**
   * Every skill the occupation is recorded as needing, offered inside the search
   * box before anything is typed.
   *
   * The five pills below are a shortcut, not the set: a product manager has
   * dozens, and picking from five meant picking from whichever five ranked
   * highest. These are the same ranking, all of it, where the user is already
   * looking when they go to add a skill.
   */
  const pinnedSkills = React.useMemo(
    () =>
      allForRole.map(skill => ({
        id: skill.id,
        name: skill.name,
        description: null,
        types: [],
        spaces: [],
      })),
    [allForRole]
  );

  const addSkill = (skill: EntityChoice) =>
    setSkills(current => (current.some(picked => picked.id === skill.id) ? current : [...current, skill]));

  const canSave = pickedCompany !== null && title !== null && !isSaving;

  const save = () => {
    if (!pickedCompany || !title) return;

    onSave({
      company: pickedCompany,
      title,
      employmentType,
      skills,
      location,
      locationType,
      startDate: start ? toGraphDate(start) : null,
      // A role still held has no end date, whatever the picker was left showing.
      endDate: isCurrent || !end ? null : toGraphDate(end),
      status: isCurrent ? 'current' : 'former',
      description,
      existingStintId: company?.stintId,
    });
  };

  return (
    <HistorySheet
      title={initial ? 'Edit role' : 'Add role'}
      isSaving={isSaving}
      canSave={canSave}
      onCancel={onCancel}
      onSave={save}
    >
      {/* Locked rather than hidden in the promotion case, so it still reads as an
          answered question and the role visibly attaches to that employer. */}
      <EntityField
        label="Company"
        value={pickedCompany}
        locked={locked ? { name: locked.name, note: 'Already on your profile — this role attaches to it.' } : undefined}
        onChange={setPickedCompany}
        onClear={() => setPickedCompany(null)}
        spaceId={spaceId}
        relationValueTypes={EMPLOYER_FILTER}
        placeholder="Example: Microsoft"
        alsoSearchSpaceIds={TAXONOMY_SPACE_ID_LIST}
      />

      <EntityField
        label="Title"
        value={title}
        onChange={setTitle}
        onClear={() => setTitle(null)}
        spaceId={spaceId}
        relationValueTypes={JOB_FILTER}
        placeholder="Example: Senior Product Manager"
        alsoSearchSpaceIds={TAXONOMY_SPACE_ID_LIST}
      />

      {/* Native rather than the design-system `Select`, which cannot be opened from
          inside this modal: it traps focus in a menu portalled outside the
          dialog, the dialog's own focus trap takes focus straight back, and the
          menu closes as fast as it opens. The entity pickers above manage because
          `SelectEntityAsPopover` is a Popover with `modal={false}`, which does not
          compete for focus. Worth fixing in `Select` — until then a control that
          opens beats one that matches. */}
      <OptionField
        label="Employment type"
        value={employmentType}
        options={EMPLOYMENT_TYPE_OPTIONS}
        onChange={setEmploymentType}
        disabled={isSaving}
      />

      {/* Above the dates, because it decides what the End picker is for: ticking
          it puts the role in the present and leaves End with nothing to say. */}
      <div className="flex items-center gap-2">
        {/* The shared Checkbox renders a bare button with no checkbox semantics.
            Supplied here rather than fixed there: several callers assert on it
            being a button, so correcting the component is its own change. */}
        <Checkbox
          checked={isCurrent}
          onChange={() => setIsCurrent(current => !current)}
          disabled={isSaving}
          role="checkbox"
          aria-checked={isCurrent}
          aria-label="I’m in this role now"
        />
        <span className="text-metadata text-text">I’m in this role now</span>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <MonthYearField label="Start" value={start} onChange={setStart} disabled={isSaving} />
        <MonthYearField label="End" value={end} onChange={setEnd} disabled={isSaving || isCurrent} />
      </div>

      {/* A place in the graph rather than a string, so the San Francisco on this
          profile is the one everybody else means. */}
      <EntityField
        label="Location"
        value={location}
        onChange={setLocation}
        onClear={() => setLocation(null)}
        spaceId={spaceId}
        relationValueTypes={LOCATION_TYPE_FILTER}
        placeholder="City or region"
      />

      <OptionField
        label="Location type"
        value={locationType}
        options={LOCATION_TYPE_OPTIONS}
        onChange={setLocationType}
        disabled={isSaving}
      />

      <TextAreaField
        label="Highlights"
        value={description}
        onChange={setDescription}
        placeholder="Projects, problems you solved, or results you achieved"
        disabled={isSaving}
      />

      <MultiEntityField
        label="Skills"
        noun="skill"
        addLabel="+ Add skill"
        items={skills}
        onChange={setSkills}
        spaceId={spaceId}
        relationValueTypes={SKILL_FILTER}
        placeholder="Example: Product management"
        disabled={isSaving}
        alsoSearchSpaceIds={TAXONOMY_SPACE_ID_LIST}
        pinnedResults={pinnedSkills}
        pinnedLabel="Recommended for this role"
        restLabel="All skills"
        extra={
          /* What the occupation itself says the job needs, essential first and
             most distinctive within that. Offered rather than applied: they are a
             shortcut past typing, not a claim about what this person did. */
          suggestions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-metadata text-grey-04">Common for this role</span>
              <ul className="flex flex-wrap gap-1.5">
                {suggestions.map(suggestion => (
                  <li key={suggestion.id}>
                    <SmallButton
                      onClick={() => addSkill({ id: suggestion.id, name: suggestion.name, isNew: false })}
                      disabled={isSaving}
                    >
                      + {suggestion.name ?? 'Untitled'}
                    </SmallButton>
                  </li>
                ))}
              </ul>
            </div>
          ) : null
        }
      />
    </HistorySheet>
  );
}
