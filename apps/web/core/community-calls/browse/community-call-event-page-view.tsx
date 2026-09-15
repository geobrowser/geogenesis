'use client';

import * as React from 'react';

import cx from 'classnames';

import { EVENT_SCHEMA } from '~/core/community-calls/constants';
import {
  type EventPhase,
  type EventTiming,
  eventPhase,
  formatTimeUntil,
  resolveEventTiming,
} from '~/core/community-calls/event-timing';
import {
  buildCallJoinUrl,
  buildGoogleCalendarHref,
  buildOutlookCalendarHref,
  formatDateLabel,
  formatTimeRange,
} from '~/core/community-calls/format';
import { useRecordingSources } from '~/core/community-calls/use-recording-sources';
import { ID } from '~/core/id';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { ClampedText } from '~/design-system/clamped-text';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { CommentSection } from '~/partials/comments/comments-section';
import { PublishedRecordingPlayer } from '~/partials/community-calls/published-recording-player';
import { Editor } from '~/partials/editor/editor';
import { ENTITY_DESCRIPTION_MAX_LINES } from '~/partials/entity-page/entity-page-inline-description';
import { META_CHIP_CLASS } from '~/partials/entity-page/relation-chip-section';

/**
 * The browse-mode read view for a `Community call event`.
 *
 * These entities were rendering as the generic value sheet with the recording wedged into the
 * cover slot, which says the same thing about a call whether it is next Tuesday or happened in
 * May. A call has two quite different jobs depending on which side of its start time you are on,
 * and this page has two corresponding shapes: before, the point is when it is and getting it into
 * your calendar; after, the point is the recording.
 *
 * Both shapes are the same page in the same order — hero, details, agenda, attendees — so the one
 * that changes is the hero. Sections render only when they have something to say.
 *
 * Laid out against a container query rather than the viewport, like the topic and claim pages, so
 * the route, the entity side panel and a phone are three widths of one page.
 */
export function CommunityCallEventPageView({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });
  const sources = useRecordingSources({ entityId, spaceId });
  const nowMs = useNowMs();

  const timing = React.useMemo(() => resolveEventTiming(entity?.values ?? []), [entity?.values]);
  // Only once mounted: the phase is a function of the clock, and deriving it during the server
  // render makes the first client render disagree with the markup it is hydrating.
  const phase: EventPhase | null = nowMs === null ? null : eventPhase(timing, nowMs);

  const series = React.useMemo(
    () => findRelation(entity?.relations, EVENT_SCHEMA.COMMUNITY_CALL_PARENT_PROPERTY),
    [entity?.relations]
  );
  const attendees = React.useMemo(
    () => (entity?.relations ?? []).filter(isLiveRelation(EVENT_SCHEMA.ATTENDEES_PROPERTY)),
    [entity?.relations]
  );

  if (isLoading && !entity) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6 @[560px]:px-5">
        <Skeleton className="h-8 w-2/3 rounded" />
        <Skeleton className="aspect-video w-full rounded-lg" />
      </div>
    );
  }

  if (!entity) return null;

  return (
    <div className="@container">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 @[560px]:gap-8 @[560px]:px-5 @[560px]:py-8">
        <header className="flex flex-col gap-3">
          {series && (
            <nav aria-label="Call series">
              <Link
                // `toSpaceId` where the relation carries one: a series can live in a different
                // space from the occurrence that points at it.
                href={NavUtils.toEntity(series.toSpaceId ?? spaceId, series.toEntity.id)}
                className="text-metadata text-grey-04 transition-colors hover:text-text"
              >
                {series.toEntity.name ?? 'Call series'}
              </Link>
            </nav>
          )}

          <Text as="h1" variant="entityTitle" color="text" className="block text-pretty wrap-break-word">
            {entity.name ?? entity.id}
          </Text>

          {entity.description && (
            <ClampedText
              text={entity.description}
              maxLines={ENTITY_DESCRIPTION_MAX_LINES}
              variant="body"
              textClassName="wrap-break-word text-grey-04"
            />
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${META_CHIP_CLASS} text-grey-04`}>Community call</span>
            {phase && <PhaseChip phase={phase} hasRecording={sources.length > 0} />}
          </div>
        </header>

        <CallHero
          spaceId={spaceId}
          name={entity.name ?? 'Community call'}
          sources={sources}
          timing={timing}
          phase={phase}
          nowMs={nowMs}
          seriesId={series?.toEntity.id ?? null}
        />

        {/* The agenda and any notes, which live on the entity as blocks exactly as they do on the
            generic page — this view replaces how they are framed, not where they are kept. */}
        <Editor spaceId={spaceId} shouldHandleOwnSpacing />

        <AttendeesSection attendees={attendees} spaceId={spaceId} />

        <CommentSection entityId={entityId} spaceId={spaceId} />
      </div>
    </div>
  );
}

/** A clock that only starts on the client, so nothing time-dependent is server-rendered. */
function useNowMs(intervalMs = 30_000): number | null {
  const [nowMs, setNowMs] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return nowMs;
}

const isLiveRelation = (typeId: string) => (relation: Relation) =>
  relation.isDeleted !== true && ID.equals(relation.type.id, typeId);

function findRelation(relations: Relation[] | undefined, typeId: string): Relation | undefined {
  return (relations ?? []).find(isLiveRelation(typeId));
}

function PhaseChip({ phase, hasRecording }: { phase: EventPhase; hasRecording: boolean }) {
  if (phase === 'live') {
    return (
      <span className={`${META_CHIP_CLASS} inline-flex items-center gap-1.5 bg-red-02 text-red-01`}>
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-red-01 motion-safe:animate-pulse" />
        Live now
      </span>
    );
  }
  if (phase === 'upcoming') return <span className={`${META_CHIP_CLASS} bg-green text-text`}>Upcoming</span>;
  // "Past" alone reads as a dead end on a call whose whole point is now the recording below it.
  if (phase === 'past') {
    return <span className={`${META_CHIP_CLASS} text-grey-04`}>{hasRecording ? 'Recorded' : 'Ended'}</span>;
  }
  return null;
}

/**
 * The half of the page that changes. A recording wins whenever there is one — it is the reason to
 * open a past call at all — and everything else is a way of saying when the call is or was.
 */
function CallHero({
  spaceId,
  name,
  sources,
  timing,
  phase,
  nowMs,
  seriesId,
}: {
  spaceId: string;
  name: string;
  sources: ReturnType<typeof useRecordingSources>;
  timing: EventTiming | null;
  phase: EventPhase | null;
  nowMs: number | null;
  seriesId: string | null;
}) {
  if (sources.length > 0) {
    return (
      <section className="flex flex-col gap-3" aria-label="Recording">
        <PublishedRecordingPlayer sources={sources} spaceId={spaceId} />
        {timing && <WhenLine timing={timing} />}
      </section>
    );
  }

  if (phase === 'upcoming' || phase === 'live') {
    return (
      <UpcomingHero
        spaceId={spaceId}
        name={name}
        timing={timing}
        live={phase === 'live'}
        nowMs={nowMs}
        seriesId={seriesId}
      />
    );
  }

  return (
    <section className="rounded-lg border border-grey-02 bg-bg px-4 py-5" aria-label="Recording">
      <Text as="p" variant="metadataMedium" color="text">
        {phase === 'undated' ? 'No recording published' : 'This call has ended'}
      </Text>
      <Text as="p" variant="metadata" color="grey-04" className="mt-1">
        {phase === 'undated'
          ? 'This call has no scheduled time and no recording on the graph yet.'
          : 'No recording has been published to the graph for this call.'}
      </Text>
      {/* Deliberately not an invitation to publish: publishing is editor-only and happens from the
          call's own Recordings tab, which is where the un-published files actually are. */}
      {timing && <WhenLine timing={timing} className="mt-3" />}
    </section>
  );
}

function UpcomingHero({
  spaceId,
  name,
  timing,
  live,
  nowMs,
  seriesId,
}: {
  spaceId: string;
  name: string;
  timing: EventTiming | null;
  live: boolean;
  nowMs: number | null;
  seriesId: string | null;
}) {
  const joinHref = seriesId ? `/space/${spaceId}/community/call/${seriesId}` : null;

  return (
    <section
      className={cx(
        'flex flex-col gap-4 rounded-lg border px-4 py-5 @[560px]:flex-row @[560px]:items-center @[560px]:justify-between',
        live ? 'border-red-01 bg-red-02' : 'border-grey-02 bg-white'
      )}
      aria-label={live ? 'Happening now' : 'Scheduled'}
    >
      <div className="flex items-center gap-4">
        {timing && <DateTile ms={timing.startMs} />}
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text as="p" variant="metadataMedium" color="text">
            {live ? 'Happening now' : timing && nowMs !== null ? formatTimeUntil(timing.startMs, nowMs) : 'Scheduled'}
          </Text>
          {timing && (
            <Text as="p" variant="metadata" color="grey-04">
              {timing.endMs === null
                ? formatDateLabel(timing.startMs)
                : `${formatDateLabel(timing.startMs)} · ${formatTimeRange(timing.startMs, timing.endMs)}`}
            </Text>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {joinHref && (
          <Link
            href={joinHref}
            className={cx(
              'inline-flex min-h-9 items-center justify-center rounded-full px-4 text-button transition-colors',
              live ? 'bg-red-01 text-white hover:bg-red-01/90' : 'bg-text text-white hover:bg-text/90'
            )}
          >
            {live ? 'Join the call' : 'Go to the call'}
          </Link>
        )}
        {timing && !live && <AddToCalendar name={name} timing={timing} spaceId={spaceId} seriesId={seriesId} />}
      </div>
    </section>
  );
}

/** The date as a calendar chip — the one piece of this page that should be readable at a glance. */
function DateTile({ ms }: { ms: number }) {
  const date = new Date(ms);
  return (
    <div
      aria-hidden
      className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg border border-grey-02 bg-white"
    >
      <span className="text-[0.6875rem] font-medium tracking-wide text-grey-04 uppercase">
        {date.toLocaleDateString('en-US', { month: 'short' })}
      </span>
      <span className="text-[1.375rem] leading-none font-semibold text-text">{date.getDate()}</span>
    </div>
  );
}

function WhenLine({ timing, className }: { timing: EventTiming; className?: string }) {
  return (
    <Text as="p" variant="metadata" color="grey-04" className={className}>
      {timing.endMs === null
        ? formatDateLabel(timing.startMs)
        : `${formatDateLabel(timing.startMs)} · ${formatTimeRange(timing.startMs, timing.endMs)}`}
    </Text>
  );
}

/**
 * Calendar links, built on the client because they need the deployment's own origin for the join
 * URL. An event with no published end gets an assumed hour so the calendar entry has a duration
 * rather than landing as a zero-length blip.
 */
function AddToCalendar({
  name,
  timing,
  spaceId,
  seriesId,
}: {
  name: string;
  timing: EventTiming;
  spaceId: string;
  seriesId: string | null;
}) {
  const [origin, setOrigin] = React.useState<string | null>(null);
  React.useEffect(() => setOrigin(window.location.origin), []);

  if (!origin) return null;

  const joinUrl = seriesId ? buildCallJoinUrl({ origin, spaceId, callId: seriesId }) : undefined;
  const args = { name, startMs: timing.startMs, endMs: timing.endMs ?? timing.startMs + 60 * 60 * 1000, joinUrl };

  return (
    <>
      <CalendarLink href={buildGoogleCalendarHref(args)}>Google Calendar</CalendarLink>
      <CalendarLink href={buildOutlookCalendarHref(args)}>Outlook</CalendarLink>
    </>
  );
}

function CalendarLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-9 items-center justify-center rounded-full border border-grey-02 bg-white px-4 text-button text-text transition-colors hover:border-grey-04"
    >
      {children}
    </a>
  );
}

function AttendeesSection({ attendees, spaceId }: { attendees: Relation[]; spaceId: string }) {
  if (attendees.length === 0) return null;

  return (
    <section className="flex flex-col gap-3" aria-label="Attendees">
      <Text as="h2" variant="smallTitle" color="text">
        Attendees
      </Text>
      <div className="flex flex-wrap gap-1.5">
        {attendees.map(attendee => (
          <Link
            key={attendee.id}
            href={NavUtils.toEntity(attendee.toSpaceId ?? spaceId, attendee.toEntity.id)}
            className={`${META_CHIP_CLASS} text-grey-04 transition-colors hover:text-text`}
          >
            {attendee.toEntity.name ?? attendee.toEntity.id}
          </Link>
        ))}
      </div>
    </section>
  );
}
