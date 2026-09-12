'use client';

import * as React from 'react';

import cx from 'classnames';

import { type MonthYear, fromGraphDate, toGraphDate } from '~/core/profile/history-dates';
import {
  ACADEMIC_FIELD_TYPE,
  DEGREE_TYPES,
  type EducationStatus,
  SCHOOL_TYPES,
  SKILL_TYPE,
  TAXONOMY_SPACE_ID,
} from '~/core/profile/history-ontology';
import type { EducationDraft, EntityChoice } from '~/core/profile/stage-history';

import { inputStyles } from '~/design-system/input';
import { SelectEntity } from '~/design-system/select-entity';

import { HistorySheet, PickedEntity, findOrCreate } from './history-sheet';
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
  const [isAddingField, setIsAddingField] = React.useState(false);
  const [status, setStatus] = React.useState<EducationStatus>(initial?.status ?? 'studying');
  const [start, setStart] = React.useState<MonthYear | null>(fromGraphDate(initial?.startDate));
  const [end, setEnd] = React.useState<MonthYear | null>(fromGraphDate(initial?.endDate));
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [skills, setSkills] = React.useState<EntityChoice[]>(initial?.skills ?? []);
  const [isAddingSkill, setIsAddingSkill] = React.useState(false);
  const [grade, setGrade] = React.useState(initial?.grade ?? '');

  const canSave = pickedSchool !== null && degree !== null && !isSaving;

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
      existingStintId: school?.stintId,
    });
  };

  return (
    <HistorySheet
      title={initial ? 'Edit education' : 'Add education'}
      isSaving={isSaving}
      canSave={canSave}
      saveLabel="Save education"
      onCancel={onCancel}
      onSave={save}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-metadataMedium text-grey-04">School</span>
        {locked ? (
          <PickedEntity name={locked.name} note="Already on your profile — this degree attaches to it." />
        ) : pickedSchool ? (
          <PickedEntity name={pickedSchool.name} onClear={() => setPickedSchool(null)} />
        ) : (
          <SelectEntity
            spaceId={spaceId}
            relationValueTypes={SCHOOL_TYPE_FILTER}
            placeholder="Find or create a school..."
            onCreateEntity={findOrCreate}
            onDone={(result, fromCreateFn) =>
              setPickedSchool({ id: result.id, name: result.name, isNew: Boolean(fromCreateFn) })
            }
            width="full"
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-metadataMedium text-grey-04">Degree</span>
        {degree ? (
          <PickedEntity name={degree.name} onClear={() => setDegree(null)} />
        ) : (
          <SelectEntity
            spaceId={spaceId}
            relationValueTypes={DEGREE_TYPE_FILTER}
            placeholder="Find or create a degree..."
            onCreateEntity={findOrCreate}
            onDone={(result, fromCreateFn) =>
              setDegree({ id: result.id, name: result.name, isNew: Boolean(fromCreateFn) })
            }
            width="full"
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-metadataMedium text-grey-04">Field</span>
        {fields.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {fields.map(field => (
              <li key={field.id} className="flex items-center gap-1.5 rounded bg-divider px-2 py-1">
                <span className="text-footnote text-text">{field.name ?? 'Untitled'}</span>
                {field.isNew && <span className="text-footnote text-ctaPrimary">NEW</span>}
                <button
                  type="button"
                  onClick={() => setFields(current => current.filter(item => item.id !== field.id))}
                  aria-label={`Remove ${field.name ?? 'field'}`}
                  className="text-footnote text-grey-04 hover:underline"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {isAddingField || fields.length === 0 ? (
          <SelectEntity
            spaceId={spaceId}
            relationValueTypes={[{ id: ACADEMIC_FIELD_TYPE, name: 'Academic field' }]}
            placeholder="Find or create a field..."
            onCreateEntity={findOrCreate}
            onDone={(result, fromCreateFn) => {
              setFields(current =>
                current.some(field => field.id === result.id)
                  ? current
                  : [...current, { id: result.id, name: result.name, isNew: Boolean(fromCreateFn) }]
              );
              setIsAddingField(false);
            }}
            width="full"
          />
        ) : (
          // A joint honours degree needs more than one, which is why Academic
          // fields is a relation rather than a value.
          <button
            type="button"
            onClick={() => setIsAddingField(true)}
            className="self-start text-footnote text-ctaPrimary hover:underline"
          >
            + Add another
          </button>
        )}
        <span className="text-footnote text-grey-04">Creates an Academic field others can use.</span>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-metadataMedium text-grey-04">Status</legend>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              aria-pressed={status === option.value}
              onClick={() => setStatus(option.value)}
              disabled={isSaving}
              className={cx(
                'rounded border px-2.5 py-1.5 text-footnote transition-colors',
                status === option.value
                  ? 'border-text bg-text text-white'
                  : 'border-grey-02 text-text hover:border-text'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-end gap-4">
        <MonthYearField label="Start" value={start} onChange={setStart} disabled={isSaving} />
        <MonthYearField label="End" value={end} onChange={setEnd} disabled={isSaving || status === 'studying'} />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-metadataMedium text-grey-04">Grade</span>
        {/* A number, because the property is a decimal. A classification or a
            pass has nowhere to go here and belongs in the description. */}
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={grade}
          onChange={event => setGrade(event.currentTarget.value)}
          disabled={isSaving}
          placeholder="Optional — e.g. 3.8"
          className={inputStyles()}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-metadataMedium text-grey-04">Skills</span>
        {skills.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {skills.map(skill => (
              <li key={skill.id} className="flex items-center gap-1.5 rounded bg-divider px-2 py-1">
                <span className="text-footnote text-text">{skill.name ?? 'Untitled'}</span>
                {skill.isNew && <span className="text-footnote text-ctaPrimary">NEW</span>}
                <button
                  type="button"
                  onClick={() => setSkills(current => current.filter(item => item.id !== skill.id))}
                  aria-label={`Remove skill ${skill.name ?? 'skill'}`}
                  className="text-footnote text-grey-04 hover:underline"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {isAddingSkill || skills.length === 0 ? (
          <SelectEntity
            spaceId={spaceId}
            relationValueTypes={[{ id: SKILL_TYPE, name: 'Skill' }]}
            placeholder="Find or create a skill..."
            alsoSearchSpaceIds={TAXONOMY_SPACE_ID_LIST}
            onCreateEntity={findOrCreate}
            onDone={(result, fromCreateFn) => {
              setSkills(current =>
                current.some(skill => skill.id === result.id)
                  ? current
                  : [...current, { id: result.id, name: result.name, isNew: Boolean(fromCreateFn) }]
              );
              setIsAddingSkill(false);
            }}
            width="full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsAddingSkill(true)}
            className="self-start text-footnote text-ctaPrimary hover:underline"
          >
            + Add skill
          </button>
        )}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-metadataMedium text-grey-04">Description</span>
        <textarea
          value={description}
          onChange={event => setDescription(event.currentTarget.value)}
          disabled={isSaving}
          rows={3}
          placeholder="Optional"
          className={`${inputStyles()} resize-none`}
        />
      </label>
    </HistorySheet>
  );
}
