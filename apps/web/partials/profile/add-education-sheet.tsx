'use client';

import * as React from 'react';

import {
  EXPECTED_YEARS_AHEAD,
  type MonthYear,
  fromGraphDate,
  isOrderedRange,
  toGraphDate,
} from '~/core/profile/history-dates';
import {
  DEGREE_TYPES,
  type EducationStatus,
  FIELD_OF_STUDY_TYPE,
  SCHOOL_TYPES,
  SKILL_TYPE,
  TAXONOMY_SPACE_ID,
} from '~/core/profile/history-ontology';
import type { EducationDraft, EntityChoice } from '~/core/profile/stage-history';

import { SmallButton } from '~/design-system/button';
import { Input } from '~/design-system/input';

import { EntityField, HistorySheet, MultiEntityField, TextAreaField } from './history-sheet';
import { MonthYearField } from './month-year-field';

type Props = {
  spaceId: string;
  school?: { id: string; name: string | null; stintId: string };
  /** The row being changed, when this is an edit rather than an addition. */
  initial?: EducationDraft;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (draft: EducationDraft) => void;
};

/**
 * University and Institution both, and stable so it does not re-trigger the
 * search on every render. See `SCHOOL_TYPES` for why it is the pair.
 */
const SCHOOL_TYPE_FILTER = SCHOOL_TYPES.map(id => ({ id, name: null }));

/** Both entities named `Degree`; see `LEGACY_DEGREE_TYPE` for why it is a pair. */
const DEGREE_TYPE_FILTER = DEGREE_TYPES.map(id => ({ id, name: 'Degree' }));

const FIELD_OF_STUDY_FILTER = [{ id: FIELD_OF_STUDY_TYPE, name: 'Field of study' }];

const SKILL_FILTER = [{ id: SKILL_TYPE, name: 'Skill' }];

/** The taxonomy lives in one space nobody is a member of; see `TAXONOMY_SPACE_ID`. */
const TAXONOMY_SPACE_ID_LIST = [TAXONOMY_SPACE_ID];

const STATUS_OPTIONS: { value: EducationStatus; label: string }[] = [
  { value: 'studying', label: 'Still studying' },
  { value: 'completed', label: 'Completed' },
  { value: 'incomplete', label: 'Did not finish' },
];

/**
 * The one sheet with a three-way status.
 *
 * The graph has Completed and Incomplete and nothing for in-progress, and both
 * of those look identical to still-studying as a missing end date. So the choice
 * is made explicitly here, and "Still studying" writes no status at all rather
 * than inventing an option the ontology does not have.
 */
export function AddEducationSheet({ spaceId, school, initial, isSaving, onCancel, onSave }: Props) {
  const locked = !initial && school ? { id: school.id, name: school.name, isNew: false } : null;

  const [pickedSchool, setPickedSchool] = React.useState<EntityChoice | null>(
    initial ? initial.school : (locked ?? null)
  );
  const [degree, setDegree] = React.useState<EntityChoice | null>(initial?.degree ?? null);
  const [fields, setFields] = React.useState<EntityChoice[]>(initial?.fields ?? []);
  const [status, setStatus] = React.useState<EducationStatus>(initial?.status ?? 'studying');
  const [start, setStart] = React.useState<MonthYear | null>(fromGraphDate(initial?.startDate));
  const [end, setEnd] = React.useState<MonthYear | null>(fromGraphDate(initial?.endDate));
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [skills, setSkills] = React.useState<EntityChoice[]>(initial?.skills ?? []);
  const [grade, setGrade] = React.useState(initial?.grade ?? '');

  // Still studying writes no end date, so the pair only has to run forwards when
  // one is actually going to be written.
  const isOrdered = status === 'studying' || isOrderedRange(start, end);
  const canSave = pickedSchool !== null && degree !== null && isOrdered && !isSaving;

  const save = () => {
    if (!pickedSchool || !degree) return;

    onSave({
      school: pickedSchool,
      degree,
      fields,
      skills,
      grade,
      startDate: start ? toGraphDate(start) : null,
      endDate: status === 'studying' || !end ? null : toGraphDate(end),
      status,
      description,
      // See the position sheet: a reopened row keeps the record it hung off.
      existingStintId: school?.stintId ?? initial?.existingStintId,
    });
  };

  return (
    <HistorySheet
      title={initial ? 'Edit education' : 'Add education'}
      isSaving={isSaving}
      canSave={canSave}
      onCancel={onCancel}
      onSave={save}
    >
      <EntityField
        label="School"
        value={pickedSchool}
        locked={
          locked ? { name: locked.name, note: 'Already on your profile — this degree attaches to it.' } : undefined
        }
        onChange={setPickedSchool}
        onClear={() => setPickedSchool(null)}
        spaceId={spaceId}
        relationValueTypes={SCHOOL_TYPE_FILTER}
        placeholder="Example: Boston University"
      />

      <EntityField
        label="Degree"
        value={degree}
        onChange={setDegree}
        onClear={() => setDegree(null)}
        spaceId={spaceId}
        relationValueTypes={DEGREE_TYPE_FILTER}
        placeholder="Example: Bachelor of Science"
      />

      {/* A joint honours degree needs more than one, which is why Fields of study
          is a relation rather than a value. */}
      <MultiEntityField
        label="Field of study"
        noun="field"
        addLabel="+ Add another"
        items={fields}
        onChange={setFields}
        spaceId={spaceId}
        relationValueTypes={FIELD_OF_STUDY_FILTER}
        placeholder="Example: Business"
        disabled={isSaving}
      />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-metadataMedium text-grey-04">Status</legend>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map(option => (
            <SmallButton
              key={option.value}
              variant={status === option.value ? 'primary' : 'secondary'}
              aria-pressed={status === option.value}
              onClick={() => setStatus(option.value)}
              disabled={isSaving}
            >
              {option.label}
            </SmallButton>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-end gap-4">
          <MonthYearField label="Start" value={start} onChange={setStart} disabled={isSaving} />
          {/* "or expected" is only true if the years on offer reach into the
              future, which they did not. */}
          <MonthYearField
            label="End"
            note="or expected"
            value={end}
            onChange={setEnd}
            disabled={isSaving || status === 'studying'}
            aheadBy={EXPECTED_YEARS_AHEAD}
          />
        </div>
        {!isOrdered && (
          <span role="alert" className="text-metadata text-red-01">
            The end date is before the start date.
          </span>
        )}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-metadataMedium text-grey-04">Grade</span>
        {/* A number, because the property is a decimal. A classification or a
            pass has nowhere to go here and belongs in the description. */}
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          value={grade}
          onChange={event => setGrade(event.currentTarget.value)}
          disabled={isSaving}
          placeholder="Example: 3.8"
        />
      </label>

      <TextAreaField
        label="Description"
        value={description}
        onChange={setDescription}
        placeholder="Activities, societies, or what you focused on"
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
        placeholder="Example: Statistics"
        disabled={isSaving}
        alsoSearchSpaceIds={TAXONOMY_SPACE_ID_LIST}
      />
    </HistorySheet>
  );
}
