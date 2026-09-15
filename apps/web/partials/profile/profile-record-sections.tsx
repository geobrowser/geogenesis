'use client';

import * as React from 'react';

import cx from 'classnames';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { formatDateRange, formatDuration, formatTotalDuration } from '~/core/profile/history-dates';
import {
  type EducationCard,
  type EmploymentCard,
  type HistoryCard,
  type HistoryEntry,
  type NamedRef,
  isOngoing,
} from '~/core/profile/normalize-history';

import { SquareButton } from '~/design-system/button';
import { ClampedText } from '~/design-system/clamped-text';
import { FallbackImage } from '~/design-system/fallback-image';
import { EditSmall } from '~/design-system/icons/edit-small';

import { ProfileEntityLink } from './profile-entity-link';

type Kind = 'employment' | 'education';

const COPY: Record<Kind, { title: string; empty: string; add: string; edit: string }> = {
  employment: {
    title: 'Experience',
    empty: 'Nothing here yet.',
    add: 'Add a role and it appears on your profile',
    edit: 'Edit experience',
  },
  education: {
    title: 'Education',
    empty: 'Nothing here yet.',
    add: 'Add a school and it appears on your profile',
    edit: 'Edit education',
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

/** How many skills the section shows before offering the rest. */
const SHOWN_SKILLS = 8;

/**
 * The Geo relation pill, as `LinkableChip` draws it.
 *
 * Spelled out rather than borrowed, because a skill is a name rather than a
 * link and `LinkableChip` is an anchor. Same border, radius, padding and type,
 * so the two read as one family.
 */
const SKILL_CHIP =
  'inline-flex items-center rounded border border-grey-02 bg-white px-1.5 py-1 text-metadataMedium leading-4.5! font-normal! text-text';

type Props = {
  kind: Kind;
  cards: (EmploymentCard | EducationCard)[];
  /** Only the owner sees an empty section, and only the owner can act on one. */
  isOwner: boolean;
  /** Opens this section's editor — add, change and remove, all in one place. */
  onEdit: () => void;
  /** Where every name on this card opens, which is the space the profile is in. */
  spaceId: string;
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
export function ProfileRecordSection({ kind, cards, isOwner, onEdit, spaceId }: Props) {
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
        {/*
         * A pen, not a plus. The section's own control should offer everything
         * that can be done to the section: a plus could only add, so removing a
         * role meant leaving the profile for the Edit profile modal, which also
         * edits your banner and your name.
         */}
        {isOwner && <SquareButton onClick={onEdit} icon={<EditSmall />} aria-label={copy.edit} />}
      </header>

      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-grey-02 px-3 py-4 text-center">
          <p className="text-metadata text-grey-04">{copy.empty}</p>
          <button type="button" onClick={onEdit} className="mt-1 text-metadata text-ctaPrimary hover:underline">
            {copy.add}
          </button>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-divider rounded-lg border border-grey-02">
          {shown.map(card => (
            <li key={card.organization.id} className="p-4">
              <OrganizationBlock card={card} isExpanded={isExpanded} spaceId={spaceId} />
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

function OrganizationBlock({
  card,
  isExpanded,
  spaceId,
}: {
  card: HistoryCard<HistoryEntry>;
  isExpanded: boolean;
  spaceId: string;
}) {
  // Time actually spent here, not the distance from the first start to the last
  // end — a gap between two spells at one employer is not time served.
  const duration = formatTotalDuration(
    card.entries.map(entry => ({ start: entry.startDate, end: entry.endDate, isOpen: isOngoing(entry) }))
  );

  // The spine appears only where there is more than one role. Someone with one
  // job at one company sees a plain row and never learns there is a level below.
  const hasRun = card.entries.length > 1;

  return (
    <div className="flex min-w-0 gap-3">
      {/*
       * The box is the size, and Geo's placeholder is what a company with no
       * logo gets. `Avatar` would draw a generated gradient beam instead — a
       * different picture for every company, which reads as a logo somebody
       * chose rather than as the absence of one. It also sizes to its box and
       * not to its `size` prop, which is what let a real logo fill this column
       * and push the dates out over the rail.
       */}
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-grey-01">
        <FallbackImage value={card.avatarUrl ?? PLACEHOLDER_SPACE_IMAGE} sizes="36px" className="object-cover" />
      </span>

      <div className="min-w-0 flex-1">
        <ProfileEntityLink
          entityId={card.organization.id}
          spaceId={spaceId}
          className="block truncate text-smallTitle text-text hover:underline"
        >
          {card.organization.name ?? 'Untitled'}
        </ProfileEntityLink>
        {duration && <p className="text-metadata text-grey-04">{duration}</p>}

        <ul className={cx('mt-2 flex flex-col gap-3', hasRun && 'border-l border-grey-02 pl-3')}>
          {card.entries.map(entry => (
            <li key={entry.relationId}>
              <EntryRow entry={entry} isExpanded={isExpanded} spaceId={spaceId} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EntryRow({ entry, isExpanded, spaceId }: { entry: HistoryEntry; isExpanded: boolean; spaceId: string }) {
  const isOpen = isOngoing(entry);
  const subject = entry.subject.name ?? 'Untitled';

  const dates = formatDateRange(entry.startDate, entry.endDate, isOpen);
  const duration = isOpen || entry.endDate !== null ? formatDuration(entry.startDate, entry.endDate) : null;

  const fields = 'fields' in entry ? (entry as { fields: NamedRef[] }).fields : [];
  const skills = 'skills' in entry ? (entry as { skills: NamedRef[] }).skills : [];
  const employmentType =
    'employmentType' in entry ? (entry as { employmentType: { name: string | null } | null }).employmentType : null;
  const location = 'location' in entry ? (entry as { location: { name: string | null } | null }).location : null;
  const locationType =
    'locationType' in entry ? (entry as { locationType: { name: string | null } | null }).locationType : null;

  const place = [location?.name, locationType?.name].filter(Boolean).join(' · ');
  const meta = [dates, duration, employmentType?.name, place].filter(Boolean).join(' · ');

  return (
    <div className="min-w-0">
      {/* The degree and its fields are separate entities that read as one line —
          "Doctor of Philosophy, Finance" — so each is its own link rather than
          one link over the sentence. */}
      <p className="truncate text-inputMedium text-text">
        <ProfileEntityLink entityId={entry.subject.id} spaceId={spaceId} className="hover:underline">
          {subject}
        </ProfileEntityLink>
        {fields.map((field, index) => (
          <React.Fragment key={`${field.id}-${index}`}>
            {index === 0 ? ', ' : ', '}
            <ProfileEntityLink entityId={field.id} spaceId={spaceId} className="hover:underline">
              {field.name ?? 'Untitled'}
            </ProfileEntityLink>
          </React.Fragment>
        ))}
      </p>
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
            <li key={`${skill.name ?? 'untitled'}-${index}`}>
              <ProfileEntityLink entityId={skill.id} spaceId={spaceId} className={cx(SKILL_CHIP, 'hover:border-text')}>
                {skill.name ?? 'Untitled'}
              </ProfileEntityLink>
            </li>
          ))}
          {!isExpanded && skills.length > 4 && <li className={cx(SKILL_CHIP, 'text-grey-04')}>+{skills.length - 4}</li>}
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
export function ProfileSkillsSection({
  skills,
  isOwner,
  spaceId,
}: {
  skills: NamedRef[];
  isOwner: boolean;
  spaceId: string;
}) {
  const [showAll, setShowAll] = React.useState(false);

  if (skills.length === 0 && !isOwner) return null;
  if (skills.length === 0) return null;

  const shown = showAll ? skills : skills.slice(0, SHOWN_SKILLS);

  return (
    <section className="flex flex-col">
      <h3 className="flex items-center gap-2 pb-2 text-metadataMedium text-grey-04">
        Skills
        <span className="rounded bg-grey-01 px-1.5 font-mono text-tag text-grey-04">{skills.length}</span>
      </h3>

      {/* The toggle sits inside the container, in the flow of the chips it
          controls — below the box it reads as a control over the section, which
          is a different and larger promise than "show the rest of these". */}
      <ul className="flex flex-wrap items-center gap-1.5 rounded-lg border border-grey-02 p-4">
        {shown.map(skill => (
          <li key={`${skill.id}-${skill.name}`}>
            <ProfileEntityLink entityId={skill.id} spaceId={spaceId} className={cx(SKILL_CHIP, 'hover:border-text')}>
              {skill.name ?? 'Untitled'}
            </ProfileEntityLink>
          </li>
        ))}
        {skills.length > SHOWN_SKILLS && (
          <li>
            <button
              type="button"
              onClick={() => setShowAll(value => !value)}
              className={cx(SKILL_CHIP, 'text-grey-04 hover:border-text hover:text-text')}
            >
              {showAll ? 'Show fewer' : `+${skills.length - SHOWN_SKILLS} more`}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}
