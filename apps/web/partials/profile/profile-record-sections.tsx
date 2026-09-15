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

import { Avatar } from '~/design-system/avatar';
import { SquareButton } from '~/design-system/button';
import { ClampedText } from '~/design-system/clamped-text';

type Kind = 'employment' | 'education';

const COPY: Record<Kind, { title: string; empty: string; add: string }> = {
  employment: {
    title: 'Experience',
    empty: 'Nothing here yet.',
    add: 'Add a role and it appears on your profile',
  },
  education: {
    title: 'Education',
    empty: 'Nothing here yet.',
    add: 'Add a school and it appears on your profile',
  },
};

/**
 * How many employers a card shows before offering the rest.
 *
 * Two. At `metadata` 16px with `smallTitle` org names and clamped descriptions,
 * three ran past the fold and pushed the whole rail below them — the figure was
 * three only while the specimen was drawn at a size the product does not use.
 */
const SHOWN = 2;

type Props = {
  kind: Kind;
  cards: (EmploymentCard | EducationCard)[];
  /** Only the owner sees an empty section, and only the owner can add to one. */
  isOwner: boolean;
  onAdd: () => void;
};

/**
 * Work or study, as a reader meets it (GEO-2859).
 *
 * One card per organisation with its roles beneath it, which is the shape #2412
 * writes: one Employment edge per company, every role hanging off it. The page
 * undoes that nesting quietly — nobody reading a CV should learn what a relation
 * entity is.
 *
 * **An empty section renders for the owner only.** For them it is a thing to do;
 * for anyone else it is a fact about somebody they cannot act on, and four empty
 * cards make an active account look abandoned.
 */
export function ProfileRecordSection({ kind, cards, isOwner, onAdd }: Props) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const copy = COPY[kind];

  if (cards.length === 0 && !isOwner) return null;

  const shown = isExpanded ? cards : cards.slice(0, SHOWN);

  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between gap-2 pb-2">
        <h3 className="flex items-center gap-2 text-metadataMedium text-grey-04">
          {copy.title}
          {cards.length > 0 && (
            <span className="rounded bg-grey-01 px-1.5 font-mono text-tag text-grey-04">{cards.length}</span>
          )}
        </h3>
        {isOwner && (
          <SquareButton onClick={onAdd} aria-label={`Add ${kind === 'employment' ? 'a position' : 'education'}`}>
            +
          </SquareButton>
        )}
      </header>

      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-grey-02 px-3 py-4 text-center">
          <p className="text-metadata text-grey-04">{copy.empty}</p>
          <button type="button" onClick={onAdd} className="mt-1 text-metadata text-ctaPrimary hover:underline">
            {copy.add}
          </button>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-divider rounded-lg border border-grey-02">
          {shown.map(card => (
            <li key={card.organization.id} className="p-4">
              <OrganizationBlock card={card} isExpanded={isExpanded} />
            </li>
          ))}
        </ul>
      )}

      {cards.length > SHOWN && (
        <button
          type="button"
          onClick={() => setIsExpanded(value => !value)}
          className="mt-2 self-start text-metadata text-ctaPrimary hover:underline"
        >
          {isExpanded ? 'Show fewer' : `Show all ${cards.length} ${kind === 'employment' ? 'experiences' : 'schools'}`}
        </button>
      )}
    </section>
  );
}

function OrganizationBlock({ card, isExpanded }: { card: HistoryCard<HistoryEntry>; isExpanded: boolean }) {
  // Time actually spent here, not the distance from the first start to the last
  // end — a gap between two spells at one employer is not time served.
  const duration = formatTotalDuration(
    card.entries.map(entry => ({ start: entry.startDate, end: entry.endDate, isOpen: isOngoing(entry) }))
  );

  // The spine appears only where there is more than one role. Someone with one
  // job at one company sees a plain row and never learns there is a level below.
  const hasRun = card.entries.length > 1;

  return (
    <div className="flex gap-3">
      <Avatar size={36} value={card.organization.id} avatarUrl={card.avatarUrl ?? undefined} square />

      <div className="min-w-0 flex-1">
        <p className="truncate text-smallTitle text-text">{card.organization.name ?? 'Untitled'}</p>
        {duration && <p className="text-metadata text-grey-04">{duration}</p>}

        <ul className={cx('mt-2 flex flex-col gap-3', hasRun && 'border-l border-grey-02 pl-3')}>
          {card.entries.map(entry => (
            <li key={entry.relationId}>
              <EntryRow entry={entry} isExpanded={isExpanded} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EntryRow({ entry, isExpanded }: { entry: HistoryEntry; isExpanded: boolean }) {
  const isOpen = isOngoing(entry);
  const subject = entry.subject.name ?? 'Untitled';

  const dates = formatDateRange(entry.startDate, entry.endDate, isOpen);
  const duration = isOpen || entry.endDate !== null ? formatDuration(entry.startDate, entry.endDate) : null;

  const fields = 'fields' in entry ? (entry as { fields: { name: string | null }[] }).fields : [];
  const skills = 'skills' in entry ? (entry as { skills: { name: string | null }[] }).skills : [];
  const employmentType =
    'employmentType' in entry ? (entry as { employmentType: { name: string | null } | null }).employmentType : null;
  const location = 'location' in entry ? (entry as { location: { name: string | null } | null }).location : null;
  const locationType =
    'locationType' in entry ? (entry as { locationType: { name: string | null } | null }).locationType : null;

  const heading = fields.length > 0 ? `${subject}, ${fields.map(f => f.name ?? 'Untitled').join(', ')}` : subject;
  const place = [location?.name, locationType?.name].filter(Boolean).join(' · ');
  const meta = [dates, duration, employmentType?.name, place].filter(Boolean).join(' · ');

  return (
    <div className="min-w-0">
      <p className="truncate text-inputMedium text-text">{heading}</p>
      {meta && <p className="text-metadata text-grey-04">{meta}</p>}

      {entry.description && (
        <div className="mt-1">
          {/* Clamped on the card, whole once the section is expanded. Named, because
              a card of four employers otherwise offers eight buttons all called More. */}
          {isExpanded ? (
            <p className="text-metadata text-text">{entry.description}</p>
          ) : (
            <ClampedText
              text={entry.description}
              label={`description for ${subject}`}
              maxLines={2}
              variant="metadata"
              textClassName="text-text"
            />
          )}
        </div>
      )}

      {skills.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {(isExpanded ? skills : skills.slice(0, 4)).map((skill, index) => (
            <li
              key={`${skill.name ?? 'untitled'}-${index}`}
              className="rounded-full border border-grey-02 px-2 py-px text-smallButton text-grey-04"
            >
              {skill.name ?? 'Untitled'}
            </li>
          ))}
          {!isExpanded && skills.length > 4 && (
            <li className="rounded-full border border-ctaTertiary px-2 py-px text-smallButton text-ctaPrimary">
              +{skills.length - 4}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Everything this person knows, drawn from work and study together.
 *
 * They belong to the person rather than to any one row, so they get a section of
 * their own rather than being spread across four cards. Sixteen on the reference
 * account, of which Purdue contributes two — and only because a field of study
 * counts as a skill.
 */
export function ProfileSkillsSection({ skills, isOwner }: { skills: string[]; isOwner: boolean }) {
  const [showAll, setShowAll] = React.useState(false);

  if (skills.length === 0 && !isOwner) return null;
  if (skills.length === 0) return null;

  const shown = showAll ? skills : skills.slice(0, 8);

  return (
    <section className="flex flex-col">
      <h3 className="flex items-center gap-2 pb-2 text-metadataMedium text-grey-04">
        Skills
        <span className="rounded bg-grey-01 px-1.5 font-mono text-tag text-grey-04">{skills.length}</span>
      </h3>

      <ul className="flex flex-wrap gap-1.5 rounded-lg border border-grey-02 p-4">
        {shown.map(skill => (
          <li key={skill} className="rounded-full border border-grey-02 px-2.5 py-0.5 text-smallButton text-grey-04">
            {skill}
          </li>
        ))}
      </ul>

      {skills.length > 8 && (
        <button
          type="button"
          onClick={() => setShowAll(value => !value)}
          className="mt-2 self-start text-metadata text-ctaPrimary hover:underline"
        >
          {showAll ? 'Show fewer' : `Show all ${skills.length} skills`}
        </button>
      )}
    </section>
  );
}
