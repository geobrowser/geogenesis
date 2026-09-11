'use client';

import * as React from 'react';

import { type MonthYear, toGraphDate } from '~/core/profile/history-dates';
import { COMPANY_TYPE, JOB_TYPE } from '~/core/profile/history-ontology';
import type { EntityChoice, PositionDraft } from '~/core/profile/stage-history';

import { Checkbox } from '~/design-system/checkbox';
import { inputStyles } from '~/design-system/input';
import { SelectEntity } from '~/design-system/select-entity';

import { HistorySheet, PickedEntity } from './history-sheet';
import { MonthYearField } from './month-year-field';

type Props = {
  spaceId: string;
  /** Pre-filled and locked when adding a second role at a company already listed. */
  company?: { id: string; name: string | null; stintId: string };
  isSaving: boolean;
  onCancel: () => void;
  onSave: (draft: PositionDraft) => void;
};

/**
 * Four questions, which become three relations, two entities and two or three
 * values. None of that appears here — that is the entire point.
 */
export function AddPositionSheet({ spaceId, company, isSaving, onCancel, onSave }: Props) {
  const locked = company ? { id: company.id, name: company.name, isNew: false } : null;

  const [pickedCompany, setPickedCompany] = React.useState<EntityChoice | null>(locked);
  const [title, setTitle] = React.useState<EntityChoice | null>(null);
  const [start, setStart] = React.useState<MonthYear | null>(null);
  const [end, setEnd] = React.useState<MonthYear | null>(null);
  const [isCurrent, setIsCurrent] = React.useState(false);
  const [description, setDescription] = React.useState('');

  const canSave = pickedCompany !== null && title !== null && !isSaving;

  const save = () => {
    if (!pickedCompany || !title) return;

    onSave({
      company: pickedCompany,
      title,
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
      title="Add position"
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
            relationValueTypes={[{ id: COMPANY_TYPE, name: 'Company' }]}
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
            relationValueTypes={[{ id: JOB_TYPE, name: 'Job' }]}
            onDone={(result, fromCreateFn) =>
              setTitle({ id: result.id, name: result.name, isNew: Boolean(fromCreateFn) })
            }
            width="full"
          />
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <MonthYearField label="Start" value={start} onChange={setStart} disabled={isSaving} />
        <MonthYearField label="End" value={end} onChange={setEnd} disabled={isSaving || isCurrent} />
      </div>

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
