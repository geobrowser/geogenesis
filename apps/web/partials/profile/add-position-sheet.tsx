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

import { Checkbox } from '~/design-system/checkbox';
import { inputStyles } from '~/design-system/input';
import { SelectEntity } from '~/design-system/select-entity';

import { HistorySheet, PickedEntity, findOrCreate } from './history-sheet';
import { MonthYearField } from './month-year-field';

/**
 * Stable so it does not re-trigger the search on every render. The taxonomy is
 * in one space and it is not one the viewer belongs to, so both pickers have to
 * ask for it by name — see `TAXONOMY_SPACE_ID`.
 */
const TAXONOMY_SPACE_ID_LIST = [TAXONOMY_SPACE_ID];

/** Cities, regions and countries — see `LOCATION_TYPES` for why not addresses. */
const LOCATION_TYPE_FILTER = LOCATION_TYPES.map(id => ({ id, name: null }));

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
  const [isAddingSkill, setIsAddingSkill] = React.useState(false);
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
            alsoSearchSpaceIds={TAXONOMY_SPACE_ID_LIST}
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

      <div className="flex flex-col gap-1.5">
        <span className="text-metadataMedium text-grey-04">Location</span>
        {location ? (
          <PickedEntity name={location.name} onClear={() => setLocation(null)} />
        ) : (
          // A place in the graph rather than a string, so the San Francisco on
          // this profile is the one everybody else means.
          <SelectEntity
            spaceId={spaceId}
            relationValueTypes={LOCATION_TYPE_FILTER}
            placeholder="Find or create a city..."
            onCreateEntity={findOrCreate}
            onDone={(result, fromCreateFn) =>
              setLocation({ id: result.id, name: result.name, isNew: Boolean(fromCreateFn) })
            }
            width="full"
          />
        )}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-metadataMedium text-grey-04">Location type</span>
        <select
          value={locationType?.id ?? ''}
          disabled={isSaving}
          onChange={event =>
            setLocationType(LOCATION_TYPE_OPTIONS.find(option => option.id === event.currentTarget.value) ?? null)
          }
          className={inputStyles()}
        >
          <option value="">Please select</option>
          {LOCATION_TYPE_OPTIONS.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>

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
            alsoSearchSpaceIds={TAXONOMY_SPACE_ID_LIST}
            pinnedResults={pinnedSkills}
            pinnedLabel="Recommended for this role"
            restLabel="All skills"
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
