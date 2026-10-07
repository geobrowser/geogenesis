'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { type SpaceLabel, spaceLabel } from '~/core/hooks/use-space-labels';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { NavUtils, validateSpaceId } from '~/core/utils/utils';
import { Z_LAYER_CLASS } from '~/core/z-layers';

import { Avatar } from '~/design-system/avatar';
import { CheckboxVisual } from '~/design-system/checkbox';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Close } from '~/design-system/icons/close';
import { ResponsePositionIcon } from '~/design-system/icons/response-position-icon';
import { SidePanel } from '~/design-system/icons/side-panel';
import { Input } from '~/design-system/input';
import { OnlineDot } from '~/design-system/online-dot';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import type { DebatePerson } from '../api';
import { useOpenDebaterProfile } from '../browse/use-open-debater-profile';
import { speakerLabel } from '../playback-utils';
import {
  type CalendarPicks,
  type ClaimListRow,
  type PanelTopic,
  type PersonListRow,
  type TopicSets,
  coversTopics,
  togglePick,
  topicFacet,
} from './calendar-narrowing';
import type { FreeSlot } from './debate-calendar-model';
import type { ClaimMatch } from './disagreement-counts';
import { debateActionAnalyticsAttributes } from './hub-analytics';
import { SpaceThumb } from './hub-facet-rail';
import { HubMultiFilterMenu } from './hub-filter-menu';
import { HUB_ICON_BUTTON_CLASS_NAME, HubPillButton } from './hub-pill-button';
import { MatchesOnlySwitch } from './matches-only-switch';
import { formatSlot } from './people-tab';

export type NarrowTab = 'people' | 'claims';

/** How many of a person's times the claim matches dropdown offers. */
const MATCH_TIME_CHIPS = 3;

/**
 * Every control in the panel is labelled on the calendar's surface, so its clicks read apart from
 * the debates hub's (`Debate calendar …` against `Debate hub …`).
 */
const panelAnalytics = (action: string, intent = 'filter_debate_calendar') =>
  debateActionAnalyticsAttributes('calendar', action, intent);

/** Someone who disagrees with the viewer on a claim, as the claim's dropdown lists them. */
export type ClaimOpponent = {
  userKey: string;
  person: DebatePerson;
  /** Their next free half-hours on the calendar, soonest first. */
  slots: FreeSlot[];
};

export type PanelClaim = ClaimListRow & {
  name: string | null;
  opponents: ClaimOpponent[];
};

export type PanelPerson = PersonListRow<{
  profileKey: string;
  matchCount: number;
  firstFree: number | null;
  inSpaces: boolean;
  person: DebatePerson;
  matches: ClaimMatch[];
}>;

/** The People and Claims pills on the calendar's filter row. */
export function CalendarNarrowPills({
  picks,
  openTab,
  onToggle,
}: {
  picks: CalendarPicks;
  /** The tab the panel is open on, if it is open. */
  openTab: NarrowTab | null;
  onToggle: (tab: NarrowTab) => void;
}) {
  const pill = (tab: NarrowTab, label: string, count: number, marker: boolean) => (
    <HubPillButton
      analyticsSurface="calendar"
      analyticsLabel={`Debate calendar ${label} filter`}
      analyticsIntent="filter_debate_calendar"
      variant={count > 0 ? 'primary' : 'secondary'}
      aria-pressed={openTab === tab}
      aria-label={count > 0 ? `${label}, ${count} picked` : label}
      onClick={() => onToggle(tab)}
      className={cx('gap-1.5', openTab === tab && count === 0 && 'bg-grey-01')}
    >
      {count > 0 ? `${label} · ${count}` : label}
      {marker ? (
        <span aria-label="Matches only is on" role="img" className="size-1.5 shrink-0 rounded-full bg-purple" />
      ) : null}
    </HubPillButton>
  );

  return (
    <div className="flex shrink-0 items-center gap-2">
      {pill('people', 'People', picks.people.length, picks.matchesOnly)}
      {pill('claims', 'Claims', picks.claims.length, false)}
    </div>
  );
}

type BodyProps = {
  tab: NarrowTab;
  onTabChange: (tab: NarrowTab) => void;
  onClose: () => void;
  picks: CalendarPicks;
  onPicksChange: (picks: CalendarPicks) => void;
  claims: PanelClaim[];
  people: PanelPerson[];
  /** Everyone's positions are still loading, the first time the panel opens. */
  loading: boolean;
  /** `false` when the viewer holds no position, `null` while that is unknown. */
  viewerHasPositions: boolean | null;
  labelsById: Map<string, SpaceLabel>;
  popoverPortal: HTMLElement | null;
  onPickTime: (userKey: string, start: string, opener: HTMLElement) => void;
  onOpenClaim: (claimId: string, spaceId: string) => void;
  /** The topics each claim carries in its own space, by claim key. */
  claimTopics: ReadonlyMap<string, readonly PanelTopic[]>;
  /** The claim keys each person holds a position on, by profile key. */
  heldByPerson: ReadonlyMap<string, ReadonlySet<string>>;
  /** Topics come with everyone's positions and the claims' entities; until then the menus wait. */
  topicsPending: boolean;
  /** A People row: the calendar's own `PersonRow`, as the debates hub's People tab draws it, ticked. */
  renderPerson: (row: PanelPerson, onToggle: () => void) => React.ReactNode;
};

/**
 * The panel's content, the same on a desktop, where it docks beside the week, and a phone, where it
 * is a bottom sheet.
 */
export function CalendarNarrowPanelBody({
  tab,
  onTabChange,
  onClose,
  picks,
  onPicksChange,
  claims,
  people,
  loading,
  viewerHasPositions,
  labelsById,
  popoverPortal,
  onPickTime,
  onOpenClaim,
  claimTopics,
  heldByPerson,
  topicsPending,
  renderPerson,
}: BodyProps) {
  const [searches, setSearches] = React.useState<Record<NarrowTab, string>>({ people: '', claims: '' });
  // Topics, like search, help find something to pick rather than being a pick: they narrow the list,
  // not the week, and leave a ticked row in place so it can be unticked.
  const [topics, setTopics] = React.useState<Record<NarrowTab, string[]>>({ people: [], claims: [] });
  const term = searches[tab].trim().toLowerCase();

  // A claim answers to its own topics; a person, who carries none, to those of every claim they hold
  // a position on.
  const claimSets = React.useCallback(
    (claim: PanelClaim): TopicSets => [claimTopics.get(claim.summary.key) ?? []],
    [claimTopics]
  );
  const personSets = React.useCallback(
    (row: PanelPerson): TopicSets =>
      [...(heldByPerson.get(row.person.profileKey) ?? [])].map(key => claimTopics.get(key) ?? []),
    [claimTopics, heldByPerson]
  );

  const searchedClaims = React.useMemo(
    () => (term ? claims.filter(claim => claim.name?.toLowerCase().includes(term)) : claims),
    [claims, term]
  );
  const searchedPeople = React.useMemo(
    () => (term ? people.filter(row => speakerLabel(row.person.person).toLowerCase().includes(term)) : people),
    [people, term]
  );
  const visibleClaims = React.useMemo(
    () => searchedClaims.filter(claim => claim.selected || coversTopics(claimSets(claim), topics.claims)),
    [claimSets, searchedClaims, topics.claims]
  );
  const visiblePeople = React.useMemo(
    () => searchedPeople.filter(row => row.selected || coversTopics(personSets(row), topics.people)),
    [personSets, searchedPeople, topics.people]
  );

  const onClaims = tab === 'claims';
  const picked = onClaims ? picks.claims.length : picks.people.length;
  const listCount = onClaims ? visibleClaims.length : visiblePeople.length;
  const tabTopics = topics[tab];
  // Over the list as everything but the topics leaves it, so each count says what picking that topic
  // would leave.
  const facet = React.useMemo(
    () =>
      onClaims
        ? topicFacet(searchedClaims.map(claimSets), topics.claims)
        : topicFacet(searchedPeople.map(personSets), topics.people),
    [claimSets, onClaims, personSets, searchedClaims, searchedPeople, topics]
  );
  const topicLabel =
    tabTopics.length === 0
      ? 'Any topic'
      : tabTopics.length === 1
        ? (facet.find(topic => topic.id === tabTopics[0])?.name ?? 'Topic')
        : `${tabTopics.length} topics`;
  const matchesDisabled = viewerHasPositions === false;
  const matchesHint = 'Take a position on a claim to see matches';

  const tabButton = (value: NarrowTab, label: string, count: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      {...panelAnalytics(`Panel ${label} tab`)}
      onClick={() => onTabChange(value)}
      className={cx(
        '-mb-px flex items-baseline gap-1.5 border-b-2 pt-2.5 pb-2 text-metadataMedium transition-colors',
        tab === value ? 'border-text text-text' : 'border-transparent text-grey-04 hover:text-text'
      )}
    >
      {label}
      <span className="text-footnote text-grey-04 tabular-nums">{count}</span>
    </button>
  );

  const narrowedByList = term !== '' || tabTopics.length > 0;
  const emptyMessage = narrowedByList
    ? onClaims
      ? 'No claims match that search.'
      : 'Nobody matches that search.'
    : picks.matchesOnly
      ? 'Nobody free this week disagrees with you on a claim yet.'
      : onClaims
        ? 'Nobody on the calendar holds a position on a claim yet.'
        : 'Nobody on the calendar matches these filters.';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b border-grey-02 px-4 pb-3">
        <div className="-mx-4 flex items-center justify-between gap-3 border-b border-divider px-4">
          <div role="tablist" aria-label="Narrow the calendar by" className="flex gap-5">
            {tabButton('people', 'People', people.length)}
            {tabButton('claims', 'Claims', claims.length)}
          </div>
          <button
            type="button"
            aria-label="Close panel"
            {...panelAnalytics('Close panel', 'debate_calendar_action')}
            onClick={onClose}
            className={HUB_ICON_BUTTON_CLASS_NAME}
          >
            <Close />
          </button>
        </div>
        <Input
          withSearchIcon
          value={searches[tab]}
          onChange={event => {
            const value = event.currentTarget.value;
            setSearches(current => ({ ...current, [tab]: value }));
          }}
          placeholder={onClaims ? 'Search claims' : 'Search people'}
          aria-label={onClaims ? 'Search claims' : 'Search people'}
        />
        <div className="flex min-h-7 flex-wrap items-center gap-2">
          <HubMultiFilterMenu
            // One menu per tab: their options differ, and an open menu should not carry across.
            key={tab}
            align="start"
            label={topicLabel}
            analytics={{ name: onClaims ? 'Claims topic' : 'People topic', surface: 'calendar' }}
            options={facet.map(topic => ({ value: topic.id, label: topic.name ?? 'Topic', count: topic.count }))}
            values={tabTopics}
            onToggle={topicId => setTopics(current => ({ ...current, [tab]: togglePick(current[tab], topicId) }))}
            onClear={() => setTopics(current => ({ ...current, [tab]: [] }))}
            clearLabel="Any topic"
            countsPending={topicsPending}
            searchPlaceholder="Search topics"
            searchEmptyLabel="No topics match"
          />
          {picked > 0 ? (
            <button
              type="button"
              {...panelAnalytics(onClaims ? 'Clear claim picks' : 'Clear people picks')}
              onClick={() => onPicksChange(onClaims ? { ...picks, claims: [] } : { ...picks, people: [] })}
              className="px-1 text-footnote text-grey-04 underline transition-colors hover:text-text"
            >
              Clear {picked} selected
            </button>
          ) : null}
          <span className="flex-1" />
          <MatchesOnlySwitch
            checked={picks.matchesOnly && !matchesDisabled}
            onChange={matchesOnly => onPicksChange({ ...picks, matchesOnly })}
            analyticsSurface="calendar"
            disabled={matchesDisabled}
            title={matchesDisabled ? matchesHint : undefined}
          />
        </div>
        {matchesDisabled ? (
          <Text as="p" variant="footnote" color="grey-04" className="-mt-2 text-right">
            {matchesHint}
          </Text>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {loading ? (
          <PanelSkeleton />
        ) : listCount === 0 ? (
          <div className="flex flex-col items-start gap-3 px-2 py-4">
            <Text as="p" variant="footnote" color="grey-04">
              {emptyMessage}
            </Text>
            {picks.matchesOnly && !narrowedByList ? (
              <HubPillButton
                analyticsSurface="calendar"
                analyticsLabel="Debate calendar Show everyone"
                analyticsIntent="filter_debate_calendar"
                onClick={() => onPicksChange({ ...picks, matchesOnly: false })}
              >
                Show everyone
              </HubPillButton>
            ) : null}
          </div>
        ) : onClaims ? (
          <ul aria-label="Claims" className="m-0 flex list-none flex-col gap-0.5 p-0">
            {visibleClaims.map(claim => (
              <ClaimRow
                key={claim.summary.key}
                claim={claim}
                labelsById={labelsById}
                popoverPortal={popoverPortal}
                onToggle={() => onPicksChange({ ...picks, claims: togglePick(picks.claims, claim.summary.key) })}
                onPickTime={onPickTime}
                onOpenClaim={onOpenClaim}
              />
            ))}
          </ul>
        ) : (
          <ul aria-label="People" className="m-0 flex list-none flex-col px-2 py-0">
            {visiblePeople.map(row => (
              <React.Fragment key={row.person.profileKey}>
                {renderPerson(row, () =>
                  onPicksChange({ ...picks, people: togglePick(picks.people, row.person.profileKey) })
                )}
              </React.Fragment>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div aria-label="Loading" className="flex flex-col gap-4 px-2 py-3">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex gap-2.5">
          <Skeleton className="size-4" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-5 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A pickable row: one checkbox stretched across the whole row, under the row's content, so a press
 * anywhere toggles it while the links and buttons drawn on top keep their own presses. Nesting them
 * inside the checkbox would be invalid HTML and steal their keyboard focus.
 */
function PickRow({
  label,
  selected,
  hidden,
  analyticsAction,
  onToggle,
  children,
}: {
  label: string;
  selected: boolean;
  hidden: boolean;
  analyticsAction: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <li className="relative">
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={hidden ? `${label} (hidden by your other filters)` : label}
        {...panelAnalytics(analyticsAction)}
        onClick={onToggle}
        className={cx(
          'absolute inset-0 rounded-lg transition-colors hover:bg-grey-01 focus-visible:outline-2 focus-visible:outline-purple',
          selected && 'bg-grey-01'
        )}
      />
      <div className={cx('pointer-events-none relative px-2 py-2.5', hidden && 'opacity-60')}>{children}</div>
    </li>
  );
}

function ClaimRow({
  claim,
  labelsById,
  popoverPortal,
  onToggle,
  onPickTime,
  onOpenClaim,
}: {
  claim: PanelClaim;
  labelsById: Map<string, SpaceLabel>;
  popoverPortal: HTMLElement | null;
  onToggle: () => void;
  onPickTime: BodyProps['onPickTime'];
  onOpenClaim: BodyProps['onOpenClaim'];
}) {
  const { summary } = claim;
  const space = spaceLabel(labelsById, summary.spaceId);
  const name = claim.name?.trim() || 'Untitled claim';
  const side = (position: boolean) => {
    const count = (position ? summary.agree : summary.disagree).size;
    const mine = summary.viewerPosition === position;
    const opposing = summary.viewerPosition !== null && !mine;
    return (
      <span
        className={cx(
          'inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-footnote',
          mine ? 'border-transparent bg-divider' : opposing ? 'border-purple bg-white' : 'border-dashed border-grey-03'
        )}
      >
        <span className="shrink-0 text-text" aria-hidden>
          <ResponsePositionIcon responseKind="stance" position={position} selected={mine} />
        </span>
        <span className="font-medium whitespace-nowrap text-text">
          {mine ? 'You: ' : ''}
          {responsePositionLabel(position)}
        </span>
        <span className="text-grey-04 tabular-nums">{count}</span>
      </span>
    );
  };

  return (
    <PickRow
      label={name}
      selected={claim.selected}
      hidden={claim.hidden}
      analyticsAction="Claim pick"
      onToggle={onToggle}
    >
      <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2.5">
        <span className="mt-0.5">
          <CheckboxVisual checked={claim.selected} />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-footnoteMedium text-grey-04">
              <SpaceThumb spaceId={summary.spaceId} image={space?.image ?? null} />
              <span className="truncate">{space?.name?.trim() || 'Space'}</span>
            </span>
            {claim.opponents.length > 0 ? (
              <span className="pointer-events-auto">
                <ClaimMatches claim={claim} name={name} popoverPortal={popoverPortal} onPickTime={onPickTime} />
              </span>
            ) : null}
          </div>
          <span className="line-clamp-3 text-metadataMedium text-text">{name}</span>
          <div className="flex items-end justify-between gap-2">
            <span className="flex flex-wrap items-center gap-1.5">
              {side(true)}
              {side(false)}
            </span>
            <button
              type="button"
              aria-label={`Open claim: ${name}`}
              title="Open claim"
              {...panelAnalytics('Open claim', 'open_entity')}
              onClick={() => onOpenClaim(summary.claimId, summary.spaceId)}
              className={cx(HUB_ICON_BUTTON_CLASS_NAME, 'pointer-events-auto')}
            >
              <SidePanel />
            </button>
          </div>
        </div>
      </div>
    </PickRow>
  );
}

/** "N matches ▾" on a claim: who disagrees with the viewer on it, each with a few times to book. */
function ClaimMatches({
  claim,
  name,
  popoverPortal,
  onPickTime,
}: {
  claim: PanelClaim;
  name: string;
  popoverPortal: HTMLElement | null;
  onPickTime: BodyProps['onPickTime'];
}) {
  const [open, setOpen] = React.useState(false);
  const count = claim.opponents.length;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`${count} ${count === 1 ? 'person disagrees' : 'people disagree'} with you on ${name}`}
          {...panelAnalytics('Claim matches', 'debate_calendar_action')}
          className="inline-flex items-center gap-0.5 text-footnoteMedium whitespace-nowrap text-purple transition-opacity hover:opacity-75"
        >
          <span className="tabular-nums">{count}</span> {count === 1 ? 'match' : 'matches'}
          <ChevronDownSmall />
        </button>
      </Popover.Trigger>
      {popoverPortal ? (
        <Popover.Portal container={popoverPortal}>
          <Popover.Content
            side="bottom"
            align="end"
            sideOffset={6}
            collisionPadding={16}
            hideWhenDetached
            aria-label={`People who disagree with you on ${name}`}
            className="z-100 w-[320px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
          >
            <p className="border-b border-grey-02 bg-grey-01 px-3 py-2 text-footnoteMedium text-grey-04">
              <span className="text-text tabular-nums">{count}</span>{' '}
              {count === 1 ? 'person disagrees' : 'people disagree'} with you on this
            </p>
            <ul className="m-0 max-h-[320px] list-none overflow-y-auto overscroll-contain p-0">
              {claim.opponents.map(({ userKey, person, slots }) => (
                <li
                  key={userKey}
                  className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2.5 border-t border-divider px-3 py-2.5 first:border-t-0"
                >
                  <span className="relative size-6">
                    <span className="block size-6 overflow-hidden rounded-full">
                      <Avatar avatarUrl={person.avatar_cid} value={person.profile_space_id} size={24} />
                    </span>
                    {person.online && !person.away ? <OnlineDot faceSize={24} /> : null}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <ProfileName person={person} />
                    {slots.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {slots.slice(0, MATCH_TIME_CHIPS).map(slot => {
                          const start = new Date(slot.start).toISOString();
                          return (
                            <button
                              key={slot.start}
                              type="button"
                              aria-label={`Schedule a debate with ${speakerLabel(person)} ${formatSlot(start)}`}
                              {...panelAnalytics('Claim match time', 'open_peer_availability')}
                              onClick={event => {
                                setOpen(false);
                                onPickTime(userKey, start, event.currentTarget);
                              }}
                              className="rounded-full border border-grey-02 px-2 py-0.5 text-footnote text-text transition-colors hover:border-text"
                            >
                              {formatSlot(start)}
                            </button>
                          );
                        })}
                      </span>
                    ) : (
                      <Text as="span" variant="footnote" color="grey-04">
                        No open times in the next two weeks
                      </Text>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
}

/** A person's name, opening their profile in the entity side panel as the calendar's rows do. */
function ProfileName({ person, className }: { person: DebatePerson; className?: string }) {
  const name = speakerLabel(person);
  const openProfile = useOpenDebaterProfile(person.profile_space_id, { interactionSurface: 'debate_calendar' });
  if (!validateSpaceId(person.profile_space_id)) {
    return (
      <Text as="span" variant="metadataMedium" className={cx('truncate', className)}>
        {name}
      </Text>
    );
  }
  return (
    <Link
      href={NavUtils.toSpace(person.profile_space_id)}
      {...panelAnalytics('Person profile', 'open_profile')}
      onClick={openProfile}
      className={cx('min-w-0 truncate text-metadataMedium text-text hover:underline', className)}
    >
      {name}
    </Link>
  );
}

/**
 * The panel on a phone: a bottom sheet over the day list. Picks made in it are a draft until "Show
 * N people", so the list behind does not reshuffle under every tap; closing it any other way drops
 * the draft.
 */
export function CalendarNarrowSheet({
  open,
  onOpenChange,
  picks,
  onApply,
  shownCount,
  renderBody,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  picks: CalendarPicks;
  onApply: (picks: CalendarPicks) => void;
  /** How many people the week would show with these picks. */
  shownCount: (picks: CalendarPicks) => number;
  /** `portal` is inside the sheet: a popover portalled outside a modal sheet could not be pressed. */
  renderBody: (
    draft: CalendarPicks,
    setDraft: (picks: CalendarPicks) => void,
    portal: HTMLElement | null
  ) => React.ReactNode;
}) {
  const [draft, setDraft] = React.useState(picks);
  // A fresh draft each time the sheet opens, from whatever is applied then.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(picks);
  }
  const count = shownCount(draft);
  const [portal, setPortal] = React.useState<HTMLDivElement | null>(null);

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className={cx('fixed inset-0 bg-text/35', Z_LAYER_CLASS.scheduleDialogBackdrop)} />
        <Content
          aria-describedby={undefined}
          className={cx(
            'rounded-t-2xl fixed inset-x-0 bottom-0 flex h-[85dvh] flex-col bg-white shadow-card focus:outline-hidden',
            Z_LAYER_CLASS.scheduleDialog
          )}
        >
          <Title className="sr-only">Narrow the calendar</Title>
          <div className="flex justify-center pt-2 pb-1" aria-hidden>
            <span className="h-1 w-9 rounded-full bg-grey-02" />
          </div>
          {renderBody(draft, setDraft, portal)}
          <div className="border-t border-grey-02 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              {...panelAnalytics('Show people')}
              onClick={() => {
                onApply(draft);
                onOpenChange(false);
              }}
              className="h-11 w-full rounded-full bg-text text-metadata text-white transition-colors hover:bg-text/90"
            >
              Show {count} {count === 1 ? 'person' : 'people'}
            </button>
          </div>
          <div ref={setPortal} />
        </Content>
      </Portal>
    </Root>
  );
}
