'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { useNearViewport } from '~/core/hooks/use-near-viewport';
import { type SpaceLabel, spaceLabel } from '~/core/hooks/use-space-labels';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { useQueryEntity } from '~/core/sync/use-store';
import { normId } from '~/core/utils/norm-id';
import { NavUtils, validateSpaceId } from '~/core/utils/utils';
import { Z_LAYER_CLASS } from '~/core/z-layers';

import { Avatar } from '~/design-system/avatar';
import { CheckboxVisual } from '~/design-system/checkbox';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Close } from '~/design-system/icons/close';
import { ResponsePositionIcon } from '~/design-system/icons/response-position-icon';
import { Input } from '~/design-system/input';
import { OnlineDot } from '~/design-system/online-dot';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import type { DebatePerson } from '../api';
import { useDebateClaimResponse } from '../browse/use-debate-claim-response';
import { useDebateClaims } from '../hooks';
import { speakerLabel } from '../playback-utils';
import {
  type CalendarPicks,
  type ClaimListRow,
  type ClaimSummary,
  type PanelTopic,
  type PersonFacts,
  type PersonListRow,
  type TopicSets,
  coversTopics,
  panelEmptyMessage,
  pickLabel,
  topicFacet,
} from './calendar-narrowing';
import type { FreeSlot } from './debate-calendar-model';
import type { ClaimMatch } from './disagreement-counts';
import {
  debateActionAnalyticsAttributes,
  debateAnalyticsLabel,
  debateSurfaceAnalyticsAttributes,
} from './hub-analytics';
import { SpaceThumb } from './hub-facet-rail';
import { HubMultiFilterMenu } from './hub-filter-menu';
import { HUB_ICON_BUTTON_CLASS_NAME, HubPillButton } from './hub-pill-button';
import { MatchesOnlySwitch } from './matches-only-switch';
import { SidePanelProfileName, formatSlot } from './people-tab';
import { toggleId } from './topic-facets';

export type NarrowTab = 'people' | 'claims';

/** How many of a person's times the claim matches dropdown offers. */
const MATCH_TIME_CHIPS = 3;

/**
 * Every control in the panel is labelled on the calendar's surface, so its clicks read apart from
 * the debates hub's (`Debate calendar …` against `Debate hub …`). Filters by default: most of the
 * panel narrows the week; the few that act pass `'action'`.
 */
const panelAnalytics = (action: string, kind: 'action' | 'filter' = 'filter') =>
  debateSurfaceAnalyticsAttributes('calendar', action, kind);

/** Someone who disagrees with the viewer on a claim, as the claim's dropdown lists them. */
export type ClaimOpponent = {
  userKey: string;
  person: DebatePerson;
  /** Their next free half-hours on the calendar, soonest first. */
  slots: FreeSlot[];
};

export type PanelClaim = ClaimListRow & {
  /** What the row calls it: the name, or that it is loading or unavailable (`claimName`). */
  name: string;
  opponents: ClaimOpponent[];
};

/** A picked person the calendar does not list: enough to name them and untick them. */
export type AbsentPick = { profileKey: string; name: string; avatarUrl: string | null };

const NO_ABSENT: readonly AbsentPick[] = [];

export type PanelPerson = PersonListRow<PersonFacts & { person: DebatePerson; matches: ClaimMatch[] }>;

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
  // A count only of what is picked: the pill says what is narrowing the week, and the panel's tabs
  // say how much there is to pick from.
  const pill = (tab: NarrowTab, label: string, picked: number, marker: boolean) => (
    <HubPillButton
      analyticsSurface="calendar"
      analyticsLabel={debateAnalyticsLabel('calendar', `${label} filter`)}
      analyticsIntent={panelAnalytics(label)['data-geo-analytics-intent']}
      variant={picked > 0 ? 'primary' : 'secondary'}
      aria-pressed={openTab === tab}
      aria-label={picked > 0 ? `${label}, ${picked} picked` : label}
      onClick={() => onToggle(tab)}
      className={cx('gap-1.5', openTab === tab && picked === 0 && 'bg-grey-01')}
    >
      {picked > 0 ? `${label} · ${picked}` : label}
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
  /** What this tab's list is drawn from is still loading. */
  loading: boolean;
  /** Everyone's positions failed to load, so the Claims list has nothing true to say yet. */
  unavailable?: boolean;
  /** `false` when the viewer holds no position, `null` while that is unknown. */
  viewerHasPositions: boolean | null;
  labelsById: Map<string, SpaceLabel>;
  popoverPortal: HTMLElement | null;
  onPickTime: (userKey: string, start: string, opener: HTMLElement) => void;
  /** The topics each claim carries in its own space, by claim key. */
  claimTopics: ReadonlyMap<string, readonly PanelTopic[]>;
  /** The claim keys each person holds a position on, by profile key. */
  heldByPerson: ReadonlyMap<string, ReadonlySet<string>>;
  /** Topics come with everyone's positions and the claims' entities; until then the menus wait. */
  topicsPending: boolean;
  /** A People row: the calendar's own `PersonRow`, as the debates hub's People tab draws it, ticked. */
  renderPerson: (row: PanelPerson, onToggle: () => void) => React.ReactNode;
  /**
   * Picked people the calendar no longer lists — offline with no open times, or past a capped list.
   * There is no `PersonRow` to draw for them, but the pick still narrows the week, so it keeps a row
   * of its own to be unticked.
   */
  absentPeople?: readonly AbsentPick[];
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
  unavailable = false,
  viewerHasPositions,
  labelsById,
  popoverPortal,
  onPickTime,
  claimTopics,
  heldByPerson,
  topicsPending,
  renderPerson,
  absentPeople = NO_ABSENT,
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
    () => (term ? claims.filter(claim => claim.name.toLowerCase().includes(term)) : claims),
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
  const visibleAbsent = React.useMemo(
    () => (term ? absentPeople.filter(absent => absent.name.toLowerCase().includes(term)) : absentPeople),
    [absentPeople, term]
  );
  const listCount = onClaims ? visibleClaims.length : visiblePeople.length + visibleAbsent.length;
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
  const emptyMessage = panelEmptyMessage({
    tab,
    searched: term !== '',
    topicCount: tabTopics.length,
    matchesOnly: picks.matchesOnly,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b border-grey-02 px-4 pb-3">
        <div className="-mx-4 flex items-center justify-between gap-3 border-b border-divider px-4">
          <div role="tablist" aria-label="Narrow the calendar by" className="flex gap-5">
            {tabButton('people', 'People', people.length + absentPeople.length)}
            {tabButton('claims', 'Claims', claims.length)}
          </div>
          <button
            type="button"
            aria-label="Close panel"
            {...panelAnalytics('Close panel', 'action')}
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
            onToggle={topicId => setTopics(current => ({ ...current, [tab]: toggleId(current[tab], topicId) }))}
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
        ) : unavailable ? (
          <Text as="p" variant="footnote" color="grey-04" className="px-2 py-4">
            Couldn&rsquo;t load everyone&rsquo;s positions. Trying again&hellip;
          </Text>
        ) : listCount === 0 ? (
          <div className="flex flex-col items-start gap-3 px-2 py-4">
            <Text as="p" variant="footnote" color="grey-04">
              {emptyMessage}
            </Text>
            {picks.matchesOnly && !narrowedByList ? (
              <HubPillButton
                analyticsSurface="calendar"
                analyticsLabel={debateAnalyticsLabel('calendar', 'Show everyone')}
                analyticsIntent={panelAnalytics('Show everyone')['data-geo-analytics-intent']}
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
                onToggle={() => onPicksChange({ ...picks, claims: toggleId(picks.claims, claim.summary.key) })}
                onPickTime={onPickTime}
              />
            ))}
          </ul>
        ) : (
          <ul aria-label="People" className="m-0 flex list-none flex-col px-2 py-0">
            {visibleAbsent.map(absent => (
              <PickRow
                key={absent.profileKey}
                label={absent.name}
                selected
                hidden
                analyticsAction="Person pick"
                onToggle={() => onPicksChange({ ...picks, people: toggleId(picks.people, absent.profileKey) })}
              >
                <div className="grid grid-cols-[1rem_2rem_minmax(0,1fr)] items-start gap-2.5">
                  <span className="mt-2">
                    <CheckboxVisual checked />
                  </span>
                  <span className="block size-8 overflow-hidden rounded-full">
                    <Avatar avatarUrl={absent.avatarUrl} value={absent.profileKey} size={32} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <Text as="span" variant="metadataMedium" className="truncate">
                      {absent.name}
                    </Text>
                    <Text as="span" variant="footnote" color="grey-04">
                      Not on the calendar in the next two weeks
                    </Text>
                  </span>
                </div>
              </PickRow>
            ))}
            {visiblePeople.map(row => (
              <React.Fragment key={row.person.profileKey}>
                {renderPerson(row, () =>
                  onPicksChange({ ...picks, people: toggleId(picks.people, row.person.profileKey) })
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
        aria-label={pickLabel(label, hidden)}
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
}: {
  claim: PanelClaim;
  labelsById: Map<string, SpaceLabel>;
  popoverPortal: HTMLElement | null;
  onToggle: () => void;
  onPickTime: BodyProps['onPickTime'];
}) {
  const { summary } = claim;
  const space = spaceLabel(labelsById, summary.spaceId);
  const name = claim.name;
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
          <ClaimSides summary={summary} name={name} />
        </div>
      </div>
    </PickRow>
  );
}

/**
 * A claim's two sides, with how many people on the calendar hold each, and the viewer's vote.
 *
 * The pills are the vote: pressing a side takes it, pressing the one held clears it, through the same
 * `useDebateClaimResponse` the debate claim surfaces publish with. That reads the claim's response
 * state, a few queries a claim, so a row only goes live once it is near the viewport — the tab lists
 * every claim anyone on the calendar holds, hundreds of them. Until then it draws the same pills
 * from the calendar's own read, unpressable.
 *
 * The counts stay the calendar's: people free in the next two weeks, the viewer left out. The vote
 * lands in them too, through the positions read's overlay of the viewer's own pending writes.
 */
function ClaimSides({ summary, name }: { summary: ClaimSummary; name: string }) {
  const { ref, nearViewport } = useNearViewport();
  return (
    <span ref={ref} className="flex flex-col gap-1">
      {nearViewport ? (
        <LiveClaimSides summary={summary} name={name} />
      ) : (
        <SidePills summary={summary} viewerPosition={summary.viewerPosition} />
      )}
    </span>
  );
}

function LiveClaimSides({ summary, name }: { summary: ClaimSummary; name: string }) {
  const { entity } = useQueryEntity({ id: summary.claimId, spaceId: summary.spaceId });
  const rows = useDebateClaims(summary.spaceId, [summary.claimId], true);
  const row = rows.data?.claims.find(claim => normId(claim.claim_entity_id) === normId(summary.claimId)) ?? null;
  const { control } = useDebateClaimResponse({
    claimId: summary.claimId,
    spaceId: summary.spaceId,
    row,
    entity: entity ?? null,
  });

  return (
    <>
      <SidePills
        summary={summary}
        viewerPosition={control.viewerPosition}
        vote={{
          onRespond: control.respond,
          disabled: !control.canRespond,
          pending: control.isResponseSubmitting,
          titleFor: control.actionTitle,
          claimName: name,
        }}
      />
      {control.responseError ? (
        <Text as="p" variant="footnote" color="red-01">
          {control.responseError}
        </Text>
      ) : null}
    </>
  );
}

function SidePills({
  summary,
  viewerPosition,
  vote,
}: {
  summary: ClaimSummary;
  viewerPosition: boolean | null;
  vote?: {
    onRespond: (position: boolean) => void;
    disabled: boolean;
    pending: boolean;
    titleFor: (position: boolean) => string | undefined;
    claimName: string;
  };
}) {
  const side = (position: boolean) => {
    const count = (position ? summary.agree : summary.disagree).size;
    const mine = viewerPosition === position;
    const opposing = viewerPosition !== null && !mine;
    const className = cx(
      'inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-footnote',
      mine ? 'border-transparent bg-divider' : opposing ? 'border-purple bg-white' : 'border-dashed border-grey-03'
    );
    const content = (
      <>
        <span className="shrink-0 text-text" aria-hidden>
          <ResponsePositionIcon responseKind="stance" position={position} selected={mine} />
        </span>
        <span className="font-medium whitespace-nowrap text-text">
          {mine ? 'You: ' : ''}
          {responsePositionLabel(position)}
        </span>
        <span className="text-grey-04 tabular-nums">{count}</span>
      </>
    );
    if (!vote) return <span className={className}>{content}</span>;
    return (
      <button
        type="button"
        aria-pressed={mine}
        aria-label={`${responsePositionLabel(position)}: ${vote.claimName}`}
        title={vote.titleFor(position)}
        {...debateActionAnalyticsAttributes('calendar', responsePositionLabel(position), 'vote')}
        disabled={vote.disabled || vote.pending}
        aria-busy={vote.pending || undefined}
        onClick={() => vote.onRespond(position)}
        className={cx(className, 'pointer-events-auto transition-colors hover:border-text disabled:opacity-60')}
      >
        {content}
      </button>
    );
  };

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {side(true)}
      {side(false)}
    </span>
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
          {...panelAnalytics('Claim matches', 'action')}
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
                    {validateSpaceId(person.profile_space_id) ? (
                      <SidePanelProfileName
                        person={person}
                        href={NavUtils.toSpace(person.profile_space_id)}
                        analyticsSurface="calendar"
                      />
                    ) : (
                      <Text as="span" variant="metadataMedium" className="truncate">
                        {speakerLabel(person)}
                      </Text>
                    )}
                    {slots.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {slots.slice(0, MATCH_TIME_CHIPS).map(slot => {
                          const start = new Date(slot.start).toISOString();
                          return (
                            <button
                              key={slot.start}
                              type="button"
                              aria-label={`Schedule a debate with ${speakerLabel(person)} ${formatSlot(start)}`}
                              // The intent the People tab's time chips carry: each opens the booking.
                              {...debateActionAnalyticsAttributes(
                                'calendar',
                                'Claim match time',
                                'open_peer_availability'
                              )}
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
  /** How many people the week would show with these picks; `null` while that is not known yet. */
  shownCount: (picks: CalendarPicks) => number | null;
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
              {count === null ? 'Show people' : `Show ${count} ${count === 1 ? 'person' : 'people'}`}
            </button>
          </div>
          <div ref={setPortal} />
        </Content>
      </Portal>
    </Root>
  );
}
