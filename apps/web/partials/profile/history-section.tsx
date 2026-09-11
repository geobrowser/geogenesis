'use client';

import * as React from 'react';

import cx from 'classnames';

import { formatDateRange, formatDuration } from '~/core/profile/history-dates';
import type { EducationCard, EmploymentCard, HistoryCard, HistoryEntry } from '~/core/profile/normalize-history';

import { SmallButton, SquareButton } from '~/design-system/button';
import { FallbackImage } from '~/design-system/fallback-image';
import { Trash } from '~/design-system/icons/trash';

type Kind = 'employment' | 'education';

type Props = {
  kind: Kind;
  cards: (EmploymentCard | EducationCard)[];
  disabled?: boolean;
  onAdd: () => void;
  onAddTo: (card: HistoryCard<HistoryEntry>) => void;
  onRemoveEntry: (card: HistoryCard<HistoryEntry>, entry: HistoryEntry) => void;
  onRemoveCard: (card: HistoryCard<HistoryEntry>) => void;
};

const COPY: Record<Kind, { title: string; add: string; addHere: string; empty: string; removeCard: string }> = {
  employment: {
    title: 'Work',
    add: 'Add position',
    addHere: 'Add another role here',
    empty: 'Nothing here yet. Add a position and it appears on your profile.',
    removeCard: 'Remove employer',
  },
  education: {
    title: 'Education',
    add: 'Add education',
    addHere: 'Add another degree here',
    empty: 'Nothing here yet. Add a school and it appears on your profile.',
    removeCard: 'Remove school',
  },
};

/**
 * The resting state: one card per organisation, every role or degree held there
 * beneath it.
 *
 * Two or more rows are drawn against a spine, the way a run of promotions reads
 * on LinkedIn — the organisation is stated once and the roles are what change.
 * That grouping is the only place the nesting underneath surfaces: someone with
 * one job at one company adds a position, sees a card, and never learns there
 * was a level below it.
 */
export function HistorySection({ kind, cards, disabled, onAdd, onAddTo, onRemoveEntry, onRemoveCard }: Props) {
  const copy = COPY[kind];

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-center justify-between">
        <h3 className="text-metadataMedium text-grey-04">{copy.title}</h3>
        <SmallButton onClick={onAdd} disabled={disabled}>
          + {copy.add}
        </SmallButton>
      </header>

      {cards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-grey-02 px-3 py-4 text-center text-footnote text-grey-04">
          {copy.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards.map(card => (
            <li key={card.relationId} className="rounded-lg border border-grey-02 p-3">
              <div className="flex items-start gap-2.5">
                <OrganizationAvatar name={card.organization.name} url={card.avatarUrl} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-metadataMedium text-text">{card.organization.name ?? 'Untitled'}</p>
                      {/* Total time at the employer — the number a run of roles is
                          actually read for. Only where there is a run. */}
                      {card.entries.length > 1 && <CardDuration entries={card.entries} />}
                    </div>

                    {/* Removing the organisation takes every row with it. Offered
                        separately so leaving one employer does not mean deleting
                        each role there one at a time. */}
                    <SmallButton
                      onClick={() => onRemoveCard(card)}
                      disabled={disabled}
                      aria-label={`${copy.removeCard} ${card.organization.name ?? 'Untitled'}`}
                    >
                      {copy.removeCard}
                    </SmallButton>
                  </div>

                  <ul
                    className={cx(
                      'mt-2 flex flex-col gap-2.5',
                      card.entries.length > 1 && 'border-l border-grey-02 pl-3'
                    )}
                  >
                    {card.entries.map(entry => (
                      <EntryRow
                        key={entry.relationId}
                        kind={kind}
                        entry={entry}
                        disabled={disabled}
                        onRemove={() => onRemoveEntry(card, entry)}
                      />
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => onAddTo(card)}
                    disabled={disabled}
                    className="mt-2 text-footnote text-ctaPrimary hover:underline disabled:text-grey-03 disabled:no-underline"
                  >
                    + {copy.addHere}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The organisation's logo, or its initial where it has none. */
function OrganizationAvatar({ name, url }: { name: string | null; url?: string | null }) {
  if (url) {
    return (
      <div className="relative size-9 shrink-0 overflow-hidden rounded bg-grey-01">
        <FallbackImage value={url} sizes="36px" className="object-cover" />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded bg-divider text-metadataMedium text-grey-04"
    >
      {(name ?? '?').trim().charAt(0).toUpperCase()}
    </div>
  );
}

function CardDuration({ entries }: { entries: HistoryEntry[] }) {
  const starts = entries.map(entry => entry.startDate).filter((date): date is string => date !== null);
  if (starts.length === 0) return null;

  // Open at the employer if any role there is still held.
  const isOpen = entries.some(entry => entry.startDate !== null && entry.endDate === null);
  const ends = entries.map(entry => entry.endDate).filter((date): date is string => date !== null);

  const duration = formatDuration([...starts].sort()[0], isOpen ? null : ([...ends].sort().at(-1) ?? null));
  return duration ? <p className="text-footnote text-grey-04">{duration}</p> : null;
}

function EntryRow({
  kind,
  entry,
  disabled,
  onRemove,
}: {
  kind: Kind;
  entry: HistoryEntry;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const dates = formatDateRange(entry.startDate, entry.endDate);
  const duration = formatDuration(entry.startDate, entry.endDate);
  const subject = entry.subject.name ?? 'Untitled';

  const fields = 'fields' in entry ? (entry as { fields: { name: string | null }[] }).fields : [];
  const employmentType =
    'employmentType' in entry ? (entry as { employmentType: { name: string | null } | null }).employmentType : null;
  const skills = 'skills' in entry ? (entry as { skills: { name: string | null }[] }).skills : [];

  const heading = fields.length > 0 ? `${subject}, ${fields.map(field => field.name).join(', ')}` : subject;

  return (
    <li className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-footnote text-text">{heading}</p>
        {employmentType?.name && <p className="text-footnote text-grey-04">{employmentType.name}</p>}

        {/* About a third of records carry no dates. A lone dash there reads as a
            rendering fault rather than as missing data, so the line is dropped. */}
        {dates && (
          <p className="text-footnote text-grey-04">
            {dates}
            {duration && ` · ${duration}`}
          </p>
        )}

        {entry.description && <p className="mt-1 text-footnote text-text">{entry.description}</p>}

        {skills.length > 0 && (
          <p className="mt-1 text-footnote text-grey-04">
            <span className="text-text">Skills:</span> {skills.map(skill => skill.name).join(', ')}
          </p>
        )}
      </div>

      <SquareButton
        onClick={onRemove}
        disabled={disabled}
        icon={<Trash />}
        aria-label={`Remove ${kind === 'employment' ? 'position' : 'degree'} ${subject}`}
      />
    </li>
  );
}
