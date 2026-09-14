'use client';

import * as React from 'react';

import cx from 'classnames';

import { formatDateRange, formatDuration, formatTotalDuration } from '~/core/profile/history-dates';
import {
  type EducationCard,
  type EmploymentCard,
  type HistoryCard,
  type HistoryEntry,
  isOngoing,
} from '~/core/profile/normalize-history';

import { SmallButton, SquareButton } from '~/design-system/button';
import { ClampedText } from '~/design-system/clamped-text';
import { FallbackImage } from '~/design-system/fallback-image';
import { Trash } from '~/design-system/icons/trash';
import { TextButton } from '~/design-system/text-button';

type Kind = 'employment' | 'education';

type Props = {
  kind: Kind;
  cards: (EmploymentCard | EducationCard)[];
  /** Where this modal publishes; a row from anywhere else is read-only here. */
  spaceId: string;
  disabled?: boolean;
  /** The read failed; what is on screen is not what is on the profile. */
  isUnavailable?: boolean;
  onAdd: () => void;
  onAddTo: (card: HistoryCard<HistoryEntry>) => void;
  onEditEntry: (card: HistoryCard<HistoryEntry>, entry: HistoryEntry) => void;
  onRemoveEntry: (card: HistoryCard<HistoryEntry>, entry: HistoryEntry) => void;
};

const COPY: Record<Kind, { title: string; add: string; addHere: string; empty: string; noun: string }> = {
  employment: {
    title: 'Experience',
    add: 'Add experience',
    addHere: 'Add another role here',
    empty: 'Nothing here yet. Add a role and it appears on your profile.',
    noun: 'role',
  },
  education: {
    title: 'Education',
    add: 'Add education',
    addHere: 'Add another degree here',
    empty: 'Nothing here yet. Add a school and it appears on your profile.',
    noun: 'degree',
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
 *
 * Removal is per row and nowhere else. A card-level "Remove employer" sat beside
 * it for a while and read as a second, different thing on a card with one role,
 * where the two buttons did exactly the same work — so the last role standing
 * takes its employer with it, and that is the only way an employer leaves.
 */
export function HistorySection({
  kind,
  cards,
  spaceId,
  disabled,
  isUnavailable,
  onAdd,
  onAddTo,
  onEditEntry,
  onRemoveEntry,
}: Props) {
  const copy = COPY[kind];

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-center justify-between">
        <h3 className="text-metadataMedium text-grey-04">{copy.title}</h3>
        <SmallButton onClick={onAdd} disabled={disabled || isUnavailable}>
          + {copy.add}
        </SmallButton>
      </header>

      {/* Adding is closed while this is showing. An empty list would otherwise
          invite adding an employer that is already there, and the second edge
          would only surface once the read started working again. */}
      {isUnavailable ? (
        <p className="rounded-lg border border-dashed border-grey-02 px-3 py-4 text-center text-metadata text-grey-04">
          We couldn’t load this. Try reloading the page.
        </p>
      ) : cards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-grey-02 px-3 py-4 text-center text-metadata text-grey-04">
          {copy.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards.map(card => (
            <li key={card.organization.id} className="rounded-lg border border-grey-02 p-4">
              <div className="flex items-start gap-2.5">
                <OrganizationAvatar name={card.organization.name} url={card.avatarUrl} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-smallTitle text-text">{card.organization.name ?? 'Untitled'}</p>
                  {/* Total time at the employer — the number a run of roles is
                      actually read for. Only where there is a run. */}
                  {card.entries.length > 1 && <CardDuration entries={card.entries} />}

                  <ul
                    className={cx(
                      'mt-2.5 flex flex-col gap-4',
                      card.entries.length > 1 && 'border-l border-grey-02 pl-3'
                    )}
                  >
                    {card.entries.map(entry => (
                      <EntryRow
                        key={entry.relationId}
                        noun={copy.noun}
                        entry={entry}
                        disabled={disabled}
                        // A proposal reaches one space. Offering Edit or Remove on
                        // a row from another would queue a change that staging
                        // cannot make, and Save would report success anyway.
                        isReadOnly={entry.spaceId !== null && entry.spaceId !== spaceId}
                        onEdit={() => onEditEntry(card, entry)}
                        onRemove={() => onRemoveEntry(card, entry)}
                      />
                    ))}
                  </ul>

                  <div className="mt-2">
                    <TextButton type="button" color="ctaPrimary" onClick={() => onAddTo(card)} disabled={disabled}>
                      + {copy.addHere}
                    </TextButton>
                  </div>
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
  // Time actually spent here, not the distance from the first start to the last
  // end — which counted a gap between two spells at the same employer as time
  // served, and read eight years off for two years of work.
  const duration = formatTotalDuration(
    entries.map(entry => ({ start: entry.startDate, end: entry.endDate, isOpen: isOngoing(entry) }))
  );

  return duration ? <p className="text-metadata text-grey-04">{duration}</p> : null;
}

function EntryRow({
  noun,
  entry,
  disabled,
  isReadOnly,
  onEdit,
  onRemove,
}: {
  noun: string;
  entry: HistoryEntry;
  disabled?: boolean;
  isReadOnly?: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const isOpen = isOngoing(entry);

  const dates = formatDateRange(entry.startDate, entry.endDate, isOpen);
  const duration = isOpen || entry.endDate !== null ? formatDuration(entry.startDate, entry.endDate) : null;
  const subject = entry.subject.name ?? 'Untitled';

  const fields = 'fields' in entry ? (entry as { fields: { name: string | null }[] }).fields : [];
  const employmentType =
    'employmentType' in entry ? (entry as { employmentType: { name: string | null } | null }).employmentType : null;
  const location = 'location' in entry ? (entry as { location: { name: string | null } | null }).location : null;
  const locationType =
    'locationType' in entry ? (entry as { locationType: { name: string | null } | null }).locationType : null;

  // One line, the way a CV states it: "San Francisco · Remote". Either half
  // stands on its own — a remote role need not name a city, and a city says
  // something without a working arrangement beside it.
  const place = [location?.name, locationType?.name].filter(Boolean).join(' · ');
  const skills = 'skills' in entry ? (entry as { skills: { name: string | null }[] }).skills : [];
  const grade = 'grade' in entry ? (entry as { grade: number | null }).grade : null;

  const heading = fields.length > 0 ? `${subject}, ${fields.map(field => field.name).join(', ')}` : subject;

  return (
    <li className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        {/* What identifies the row opens it. Everything shown was typed into the
            sheet, so the sheet is where it is changed — a separate pencil would
            only be a smaller target for the same thing.

            The description is outside this button rather than in it: it carries
            its own More toggle, and a button inside a button is neither valid nor
            clickable without also opening the sheet. */}
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled || isReadOnly}
          aria-label={
            isReadOnly ? `${subject} — added in another space, so it cannot be edited here` : `Edit ${noun} ${subject}`
          }
          className="w-full text-left"
        >
          <p className="truncate text-inputMedium text-text">{heading}</p>
          {employmentType?.name && <p className="text-metadata text-grey-04">{employmentType.name}</p>}

          {/* About a third of records carry no dates. A lone dash there reads as a
              rendering fault rather than as missing data, so the line is dropped. */}
          {dates && (
            <p className="text-metadata text-grey-04">
              {dates}
              {duration && ` · ${duration}`}
            </p>
          )}

          {place && <p className="text-metadata text-grey-04">{place}</p>}
          {grade !== null && <p className="text-metadata text-grey-04">Grade {grade}</p>}
        </button>

        {/* Clamped, because this list is scanned to find a row rather than read.
            Three lines is enough to recognise which position it is, and More is
            there for when it is not — a profile with four jobs was otherwise a
            wall of text between the reader and the Save button. */}
        {entry.description && (
          <div className="mt-1">
            <ClampedText text={entry.description} maxLines={3} variant="metadata" textClassName="text-text" />
          </div>
        )}

        {/* Clamped for the same reason as the description, at two lines rather than
            three: a long list of skills says "there are many" well before it is
            read to the end. The label folds into the clamped text because the
            component takes a string, and a two-tone prefix is not worth a second
            implementation of the measuring this one already does. */}
        {skills.length > 0 && (
          <div className="mt-1">
            <ClampedText
              text={`Skills: ${skills.map(skill => skill.name).join(', ')}`}
              maxLines={2}
              variant="metadata"
              textClassName="text-grey-04"
            />
          </div>
        )}
      </div>

      {!isReadOnly && (
        <SquareButton
          onClick={onRemove}
          disabled={disabled}
          icon={<Trash />}
          aria-label={`Remove ${noun} ${subject}`}
        />
      )}
    </li>
  );
}
