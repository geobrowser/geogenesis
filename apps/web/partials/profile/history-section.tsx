'use client';

import * as React from 'react';

import { formatDateRange } from '~/core/profile/history-dates';
import type { EducationCard, EmploymentCard, HistoryCard, HistoryEntry } from '~/core/profile/normalize-history';

import { SmallButton, SquareButton } from '~/design-system/button';
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
 * as a dated row beneath it.
 *
 * The nesting underneath — a relation carrying an entity carrying another
 * relation — surfaces nowhere except "Add another role here". Someone with one
 * job at one company adds a position, sees a card, and never learns there was a
 * level below it.
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
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-metadataMedium text-text">{card.organization.name ?? 'Untitled'}</p>
                {/* Removing the organisation takes every row with it. Offered
                    separately from the per-row delete so leaving one employer
                    does not mean deleting each role there one at a time. */}
                <SmallButton
                  onClick={() => onRemoveCard(card)}
                  disabled={disabled}
                  aria-label={`${copy.removeCard} ${card.organization.name ?? 'Untitled'}`}
                >
                  {copy.removeCard}
                </SmallButton>
              </div>

              <ul className="mt-2 flex flex-col gap-1.5">
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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
  const fields = 'fields' in entry ? (entry as { fields: { name: string | null }[] }).fields : [];
  const subject = entry.subject.name ?? 'Untitled';
  const heading = fields.length > 0 ? `${subject}, ${fields.map(field => field.name).join(', ')}` : subject;

  return (
    <li className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-footnote text-text">{heading}</p>
        {/* About a third of records carry no dates. A lone dash there reads as a
            rendering fault rather than as missing data, so the line is dropped. */}
        {dates && <p className="text-footnote text-grey-04">{dates}</p>}
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
