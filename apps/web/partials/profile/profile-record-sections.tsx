'use client';

import * as React from 'react';

import cx from 'classnames';

import { formatDateRange, formatDuration } from '~/core/profile/history-dates';
import {
  type EducationCard,
  type EmploymentCard,
  type HistoryCard,
  type HistoryEntry,
  type NamedRef,
  isOngoing,
} from '~/core/profile/normalize-history';
import { visibleHistoryCards } from '~/core/profile/visible-history';

import { SquareButton } from '~/design-system/button';
import { ClampedText } from '~/design-system/clamped-text';
import { EditSmall } from '~/design-system/icons/edit-small';
import { Skeleton } from '~/design-system/skeleton';

import { OrganizationImage } from './organization-image';
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
  /**
   * The history is still on the way.
   *
   * Distinct from "there is none", and the two cannot share a rendering: with no
   * cards yet a visitor got nothing at all and then a section, which moved
   * everything under it, while the owner got *Nothing here yet — add a role* over
   * a profile that already had four. One row is reserved instead, which is what
   * most accounts settle at.
   */
  isLoading?: boolean;
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
export function ProfileRecordSection({ kind, cards, isOwner, onEdit, spaceId, isLoading = false }: Props) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  // Counted in roles rather than employers, and a company is all-or-nothing —
  // see `visibleHistoryCards`.
  //
  // Kept even while expanded, because whether there is anything to expand *to*
  // is what decides if the control shows at all. Asking it of `shown` instead
  // made the control disappear the moment it was pressed, with no way back.
  //
  // Above the early return, and it has to stay there. A visitor renders first
  // while the history is still loading — no cards — and again once it arrives,
  // and a `useMemo` below the return would be called on the second render and
  // not the first: "Rendered more hooks than during the previous render", on
  // every profile that has any history at all.
  const collapsed = React.useMemo(() => visibleHistoryCards(cards), [cards]);

  const copy = COPY[kind];

  // Reserved before anything is known, for everyone. The read decides whether
  // there is a section here at all, so neither branch below can be drawn yet —
  // and a visitor is the case that needs it most, since for them the section
  // appears from nothing rather than replacing an empty state.
  if (isLoading && cards.length === 0) return <RecordSectionSkeleton title={copy.title} />;

  if (cards.length === 0 && !isOwner) return null;

  const shown = isExpanded ? cards : collapsed;

  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between gap-2 pb-2">
        <h3 className="text-mediumTitle text-text">{copy.title}</h3>
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
        <ul className="flex flex-col divide-y divide-divider">
          {shown.map(card => (
            <li key={card.organization.id} className="py-4">
              <OrganizationBlock kind={kind} card={card} isExpanded={isExpanded} spaceId={spaceId} />
            </li>
          ))}
        </ul>
      )}

      {collapsed.length < cards.length && (
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

/**
 * One card's worth of height under the section's own title.
 *
 * The title is real text rather than a bar: it is known before the read is, it
 * is what tells a reader which section is arriving, and drawing it as a
 * placeholder would make the one certain thing on screen look uncertain.
 *
 * The block measures like `OrganizationBlock`'s employment row — a 50px logo
 * beside three lines — inside the same `py-4` the real list item carries.
 */
function RecordSectionSkeleton({ title }: { title: string }) {
  return (
    <section className="flex flex-col" aria-busy="true">
      <header className="flex items-center justify-between gap-2 pb-2">
        <h3 className="text-mediumTitle text-text">{title}</h3>
      </header>
      <div className="flex min-w-0 gap-5 py-4">
        <Skeleton className="size-[50px] shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-5 w-2/5 rounded" />
          <Skeleton className="h-5 w-1/3 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
        </div>
      </div>
    </section>
  );
}

function OrganizationBlock({
  kind,
  card,
  isExpanded,
  spaceId,
}: {
  kind: Kind;
  card: HistoryCard<HistoryEntry>;
  isExpanded: boolean;
  spaceId: string;
}) {
  // The spine appears only where there is more than one entry. Someone with one
  // course at one school sees a plain row and never learns there is a level below.
  const hasRun = card.entries.length > 1;

  const organizationLink = (className: string) => (
    <ProfileEntityLink entityId={card.organization.id} spaceId={spaceId} className={className}>
      {card.organization.name ?? 'Untitled'}
    </ProfileEntityLink>
  );

  // Experience leads with what the person does rather than where. Entries are
  // sorted newest first, so the first is the current or most recent role: its
  // title heads the card, the company sits under it, and its own dates follow
  // straight after, with no company-wide total in between. Earlier roles at the
  // same company hang off a spine below.
  const [leadRole, ...earlierRoles] = card.entries;
  if (kind === 'employment' && leadRole) {
    return (
      <div className="flex min-w-0 gap-5">
        <OrganizationImage url={card.avatarUrl} size={50} />

        <div className="min-w-0 flex-1">
          <ProfileEntityLink
            entityId={leadRole.subject.id}
            spaceId={spaceId}
            className="block truncate text-smallTitle text-text hover:underline"
          >
            {leadRole.subject.name ?? 'Untitled'}
          </ProfileEntityLink>
          {organizationLink('mt-0.5 block truncate text-smallTitle text-grey-04 hover:underline')}
          <div className="mt-1.5">
            <EntryRow entry={leadRole} isExpanded={isExpanded} spaceId={spaceId} hideTitle />
          </div>

          {earlierRoles.length > 0 && (
            <ul className="mt-3 flex flex-col gap-3 border-l border-grey-02 pl-3">
              {earlierRoles.map(entry => (
                <li key={entry.relationId}>
                  <EntryRow entry={entry} isExpanded={isExpanded} spaceId={spaceId} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 gap-5">
      <OrganizationImage url={card.avatarUrl} size={50} />

      <div className="min-w-0 flex-1">
        {/* The school, then each course with its own dates — no school-wide
            total ahead of them. Laid out as Experience's heading is, with the two
            lines swapped: school, course in grey, then the course's dates. */}
        {organizationLink('block truncate text-smallTitle text-text hover:underline')}

        <ul className={cx('mt-0.5 flex flex-col gap-3', hasRun && 'border-l border-grey-02 pl-3')}>
          {card.entries.map(entry => (
            <li key={entry.relationId}>
              <EntryRow entry={entry} isExpanded={isExpanded} spaceId={spaceId} titleStyle="heading" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  isExpanded,
  spaceId,
  hideTitle = false,
  titleStyle = 'body',
}: {
  entry: HistoryEntry;
  isExpanded: boolean;
  spaceId: string;
  /** The card's heading already names this entry. */
  hideTitle?: boolean;
  /**
   * `heading` draws the title at the card heading's size in grey, 2px above the
   * dates — the second line of an Experience heading, for a course under its school.
   */
  titleStyle?: 'body' | 'heading';
}) {
  const isOpen = isOngoing(entry);
  // The +N chip opens this row's skills on its own, without expanding the whole section.
  const [showAllSkills, setShowAllSkills] = React.useState(false);
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
      {!hideTitle && (
        <p
          className={cx(
            'truncate',
            titleStyle === 'heading' ? 'text-smallTitle text-grey-04' : 'text-inputMedium text-text'
          )}
        >
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
      )}
      {meta && (
        <p className={cx('text-metadata text-grey-04', titleStyle === 'heading' && !hideTitle && 'mt-1.5')}>{meta}</p>
      )}

      {entry.description && (
        <div className="mt-3">
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
        <ul className="mt-3 flex flex-wrap gap-1">
          {(isExpanded || showAllSkills ? skills : skills.slice(0, 4)).map((skill, index) => (
            <li key={`${skill.name ?? 'untitled'}-${index}`}>
              <ProfileEntityLink entityId={skill.id} spaceId={spaceId} className={cx(SKILL_CHIP, 'hover:border-text')}>
                {skill.name ?? 'Untitled'}
              </ProfileEntityLink>
            </li>
          ))}
          {!isExpanded && !showAllSkills && skills.length > 4 && (
            <li>
              <button
                type="button"
                onClick={() => setShowAllSkills(true)}
                aria-label={`Show ${skills.length - 4} more skills for ${subject}`}
                className={cx(SKILL_CHIP, 'text-grey-04 hover:border-text hover:text-text')}
              >
                +{skills.length - 4}
              </button>
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
export function ProfileSkillsSection({ skills, spaceId }: { skills: NamedRef[]; spaceId: string }) {
  const [showAll, setShowAll] = React.useState(false);

  // Hidden from the owner too, unlike Experience and Education.
  //
  // Those are authored, so an empty one is a thing to do and gets a pen. Skills
  // are *derived* — they are collected off the roles and degrees above, and
  // there is nothing to add here that is not added there. An empty section with
  // a control that opened somebody else's editor would be a worse answer than
  // no section.
  if (skills.length === 0) return null;

  const shown = showAll ? skills : skills.slice(0, SHOWN_SKILLS);

  return (
    <section className="flex flex-col">
      <h3 className="pb-2 text-mediumTitle text-text">Skills</h3>

      {/* The toggle sits inside the container, in the flow of the chips it
          controls — below the box it reads as a control over the section, which
          is a different and larger promise than "show the rest of these". */}
      <ul className="flex flex-wrap items-center gap-1.5">
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
