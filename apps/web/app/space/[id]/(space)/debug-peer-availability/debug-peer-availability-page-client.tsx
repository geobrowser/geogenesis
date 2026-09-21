'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { toPeerSchedule } from '~/core/availability/peer-schedule';
import { usePeerSchedule } from '~/core/debates/hooks';
import { usePeerAvailabilityEnabled } from '~/core/state/feature-flags';

import { Text } from '~/design-system/text';

import { PeerAvailabilityView } from '~/partials/availability/peer-availability';
import { PeerAvailabilityModal } from '~/partials/availability/peer-availability-modal';

/**
 * A page to try the GEO-2938 availability view against, beside `debug-availability` and for the
 * same reason: the shareable link that will open this properly is someone else's work, and the
 * timezone behaviour needs somewhere inspectable long before then.
 *
 * Two halves. A real user id fetches live and shows the raw response beside the view, which is
 * the only way to see the wire and the render disagree. The fixtures below draw the states the
 * endpoint cannot produce yet — a dashed week, a peer with nothing, a truncated list — so the
 * half of this feature that is waiting on Patrick is still exercisable by hand.
 */
export function DebugPeerAvailabilityPageClient({ spaceId }: { spaceId: string }) {
  const enabled = usePeerAvailabilityEnabled();
  const router = useRouter();
  React.useEffect(() => {
    if (!enabled) router.replace(`/space/${spaceId}`);
  }, [enabled, router, spaceId]);

  const [input, setInput] = React.useState('');
  const [userId, setUserId] = React.useState<string | null>(null);
  const [fixture, setFixture] = React.useState<FixtureName | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);

  const { schedule, data, isPending, isError, error } = usePeerSchedule(userId);
  const shown = fixture ? FIXTURES[fixture] : schedule;

  if (!enabled) return null;

  return (
    <div className="flex flex-col gap-4 py-6">
      <div className="flex flex-col gap-1">
        <Text as="h1" variant="mediumTitle">
          Someone else&rsquo;s availability
        </Text>
        <Text as="p" variant="footnote" color="grey-04">
          A geo-chat user id, not a profile space id.
        </Text>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={event => {
          event.preventDefault();
          setFixture(null);
          setUserId(input.trim() || null);
        }}
      >
        <input
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder="user id"
          aria-label="User id"
          className="min-w-64 rounded-lg border border-grey-02 px-2.5 py-1 text-metadata"
        />
        <DebugButton type="submit">Load</DebugButton>
        <DebugButton onClick={() => setModalOpen(true)} disabled={!userId}>
          Open full screen
        </DebugButton>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Text as="span" variant="footnote" color="grey-04">
          Or a fixture:
        </Text>
        {(Object.keys(FIXTURES) as FixtureName[]).map(name => (
          <DebugButton
            key={name}
            onClick={() => {
              setUserId(null);
              setFixture(name);
            }}
          >
            {name}
          </DebugButton>
        ))}
      </div>

      {/* Breakpoints are max-width here, so the side-by-side pair is the unprefixed default. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
        <Panel title="The view" note={fixture ? 'fixture' : userId ? 'live' : 'nothing loaded'}>
          <div className="p-3">
            {shown ? (
              <PeerAvailabilityView schedule={shown} peerName={fixture ? 'Ada' : null} />
            ) : (
              <Text as="p" variant="footnote" color="grey-04">
                {userId && isPending ? 'Loading…' : userId && isError ? String(error) : 'Load a user id or a fixture.'}
              </Text>
            )}
          </div>
        </Panel>

        <Panel title="Raw response" note={data ? `${data.slots.length} slots` : '—'}>
          <pre className="overflow-x-auto p-3 text-footnote whitespace-pre">
            {data ? JSON.stringify(data, null, 2) : fixture ? 'Fixtures have no wire form.' : ''}
          </pre>
        </Panel>
      </div>

      {userId && <PeerAvailabilityModal open={modalOpen} userId={userId} onClose={() => setModalOpen(false)} />}
    </div>
  );
}

/**
 * The states the endpoint cannot send today.
 *
 * `slots` is currently a true intersection and comes back empty whenever either side has no
 * schedule, so everything except `mutual` is unreachable live. They are written as view models
 * rather than as wire payloads because the wire has no way to say any of this yet.
 */
const FIXTURES = {
  mutual: fixture({}),
  'theirs only': fixture({
    viewerHasSchedule: false,
    peerHasSchedule: null,
    slots: week(false),
  }),
  mixed: fixture({ slots: [...week(true).slice(0, 6), ...week(false).slice(6)] }),
  'they have none': fixture({ peerHasSchedule: false, slots: [] }),
  'far apart': fixture({ viewerTimezone: 'America/Los_Angeles', peerTimezone: 'Asia/Tokyo' }),
  truncated: fixture({ truncated: true }),
} satisfies Record<string, ReturnType<typeof fixture>>;

type FixtureName = keyof typeof FIXTURES;

function fixture(overrides: Partial<ReturnType<typeof base>>) {
  return { ...base(), ...overrides };
}

function base() {
  return toPeerSchedule(
    {
      with: 'debug-peer',
      both_have_schedules: true,
      viewer_timezone: 'America/New_York',
      with_timezone: 'Europe/Berlin',
      slots: week(true).map(slot => ({ start: slot.start, end: slot.end })),
      truncated: false,
    },
    { viewerHasSchedule: true }
  );
}

/** A plausible week: a few hours on most days, enough on two of them to trip the expander. */
function week(viewerIsFree: boolean) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  return [0, 1, 2, 4, 5]
    .flatMap(day =>
      (day === 1 ? [9, 10, 11, 13, 18, 19] : [9, 17, 18]).map(hour => {
        const start = new Date(midnight);
        start.setDate(start.getDate() + day);
        start.setHours(hour);
        return {
          start: start.toISOString(),
          end: new Date(start.getTime() + 30 * 60_000).toISOString(),
          viewerIsFree,
        };
      })
    )
    .sort((a, b) => a.start.localeCompare(b.start));
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-grey-02 bg-white">
      <div className="flex items-center justify-between border-b border-grey-02 px-3 py-2">
        <Text as="h2" variant="metadataMedium">
          {title}
        </Text>
        <Text as="span" variant="footnote" color="grey-04">
          {note}
        </Text>
      </div>
      {children}
    </div>
  );
}

function DebugButton({
  onClick,
  type = 'button',
  disabled,
  children,
}: {
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-dashed border-grey-02 px-2.5 py-1 text-metadata text-grey-04 transition-colors hover:text-text disabled:opacity-40"
    >
      {children}
    </button>
  );
}
