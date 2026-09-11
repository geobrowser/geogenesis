'use client';

import * as React from 'react';

import cx from 'classnames';

import { type MonthYear, fromGraphDate, toGraphDate } from '~/core/profile/history-dates';
import { ACADEMIC_FIELD_TYPE, type EducationStatus } from '~/core/profile/history-ontology';
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

  const canSave = pickedSchool !== null && degree !== null && !isSaving;

  const save = () => {
    if (!pickedSchool || !degree) return;

    onSave({
      school: pickedSchool,
      degree,
      fields,
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
          // Unscoped on purpose: several entities are named "University" and
          // "School" with no obvious canonical type, and a wrong filter would
          // hide every real school from the search.
          <SelectEntity
            spaceId={spaceId}
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
