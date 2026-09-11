'use client';

import * as React from 'react';

import { useSuggestedSkills } from '~/core/hooks/use-suggested-skills';
import { type MonthYear, fromGraphDate, toGraphDate } from '~/core/profile/history-dates';
import { EMPLOYER_TYPE, EMPLOYMENT_TYPE_OPTIONS, JOB_TYPE, SKILL_TYPE } from '~/core/profile/history-ontology';
import type { EntityChoice, PositionDraft } from '~/core/profile/stage-history';

import { Checkbox } from '~/design-system/checkbox';
import { inputStyles } from '~/design-system/input';
import { SelectEntity } from '~/design-system/select-entity';

import { HistorySheet, PickedEntity, findOrCreate } from './history-sheet';
import { MonthYearField } from './month-year-field';

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
  const [isAddingSkill, setIsAddingSkill] = React.useState(false);
  const [isCurrent, setIsCurrent] = React.useState(initial ? initial.status === 'current' : false);
  const [description, setDescription] = React.useState(initial?.description ?? '');

  // Only ESCO occupations carry these; a title somebody typed in themselves has
  // none, and the row simply does not appear.
  const { suggestions } = useSuggestedSkills({
    roleId: title?.id,
    picked: React.useMemo(() => skills.map(skill => skill.id), [skills]),
  });

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
      title={initial ? 'Edit position' : 'Add position'}
      isSaving={isSaving}
      canSave={canSave}
      saveLabel="Save position"
      onCancel={onCancel}
      onSave={save}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-metadataMedium text-grey-04">Company</span>
        {locked ? (
          // The promotion case. Locked rather than hidden so it still reads as an
          // answered question, and so the role visibly attaches to that employer.
          <PickedEntity name={locked.name} note="Already on your profile — this role attaches to it." />
        ) : pickedCompany ? (
          <PickedEntity name={pickedCompany.name} onClear={() => setPickedCompany(null)} />
        ) : (
          <SelectEntity
            spaceId={spaceId}
            relationValueTypes={[{ id: EMPLOYER_TYPE, name: 'Project' }]}
            placeholder="Find or create a company..."
            onCreateEntity={findOrCreate}
            onDone={(result, fromCreateFn) =>
              setPickedCompany({ id: result.id, name: result.name, isNew: Boolean(fromCreateFn) })
            }
            width="full"
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-metadataMedium text-grey-04">Title</span>
        {title ? (
          <PickedEntity name={title.name} onClear={() => setTitle(null)} />
        ) : (
          <SelectEntity
            spaceId={spaceId}
            relationValueTypes={[{ id: JOB_TYPE, name: 'Person role' }]}
            placeholder="Find or create a job title..."
            onCreateEntity={findOrCreate}
            onDone={(result, fromCreateFn) =>
              setTitle({ id: result.id, name: result.name, isNew: Boolean(fromCreateFn) })
            }
            width="full"
          />
        )}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-metadataMedium text-grey-04">Employment type</span>
        <select
          value={employmentType?.id ?? ''}
          disabled={isSaving}
          onChange={event =>
            setEmploymentType(EMPLOYMENT_TYPE_OPTIONS.find(option => option.id === event.currentTarget.value) ?? null)
          }
          className={inputStyles()}
        >
          <option value="">Please select</option>
          {EMPLOYMENT_TYPE_OPTIONS.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>

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
        <span className="text-footnote text-text">I’m in this role now</span>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <MonthYearField label="Start" value={start} onChange={setStart} disabled={isSaving} />
        <MonthYearField label="End" value={end} onChange={setEnd} disabled={isSaving || isCurrent} />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-metadataMedium text-grey-04">Highlights</span>
        <textarea
          value={description}
          onChange={event => setDescription(event.currentTarget.value)}
          disabled={isSaving}
          rows={3}
          placeholder="Optional"
          className={`${inputStyles()} resize-none`}
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
            onCreateEntity={findOrCreate}
            onDone={(result, fromCreateFn) => {
              addSkill({ id: result.id, name: result.name, isNew: Boolean(fromCreateFn) });
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

        {/* What the occupation itself says the job needs, essential first and
            most distinctive within that. Offered rather than applied: they are a
            shortcut past typing, not a claim about what this person did. */}
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-footnote text-grey-04">Common for this role</span>
            <ul className="flex flex-wrap gap-1.5">
              {suggestions.map(suggestion => (
                <li key={suggestion.id}>
                  <button
                    type="button"
                    onClick={() => addSkill({ id: suggestion.id, name: suggestion.name, isNew: false })}
                    disabled={isSaving}
                    className="rounded border border-grey-02 px-2 py-1 text-footnote text-text transition-colors hover:border-text disabled:text-grey-03"
                  >
                    + {suggestion.name ?? 'Untitled'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </HistorySheet>
  );
}
