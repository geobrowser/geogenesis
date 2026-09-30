'use client';

import * as React from 'react';

import { NOT_A_PERSON_MESSAGE, toAvailability } from '~/core/availability/availability-deep-link';
import { debateAvailabilityLinkOpened } from '~/core/availability/schedule-analytics';
import { useAvailabilityDeepLink } from '~/core/availability/use-availability-deep-link';
import { isDebateProfileMissing } from '~/core/debates/api';
import { useDebateProfile, useGeoChatAuth } from '~/core/debates/hooks';
import { debateActionAnalyticsAttributes } from '~/core/debates/matchmaking/hub-analytics';
import { useEffectOnceWhen } from '~/core/hooks/use-effect-once';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSpace } from '~/core/hooks/use-space';
import { useSetToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { Spaces } from '~/core/utils/space';

import { OwnScheduleModal } from './own-schedule-modal';
import { Notice } from './peer-availability';
import { PeerAvailabilityBookingModal } from './peer-availability-booking-modal';

/**
 * Hosts the availability link (`?modal=availability`, see `core/availability/availability-deep-link`)
 * from `DeepLinkHandler`.
 *
 * Deliberately not behind the booking flag: the link is the opt-in. Only someone with the flag can
 * copy one, and whoever they send it to has no reason to have heard of the flag.
 */
export function AvailabilityDeepLink() {
  const [profileSpaceId, setProfileSpaceId] = React.useState<string | null>(null);
  const [rescheduleRequestId, setRescheduleRequestId] = React.useState<string | null>(null);
  const [via, setVia] = React.useState<string | null>(null);
  const setToast = useSetToast();
  const notAPerson = React.useCallback(() => setToast(<span>{NOT_A_PERSON_MESSAGE}</span>), [setToast]);
  useAvailabilityDeepLink((spaceId, requestId, linkVia) => {
    if (!spaceId) return notAPerson();
    setProfileSpaceId(spaceId);
    setRescheduleRequestId(requestId);
    setVia(linkVia);
  });
  // Stable, since the modal fires it from an effect.
  const dismissNotAPerson = React.useCallback(() => {
    setProfileSpaceId(null);
    notAPerson();
  }, [notAPerson]);

  if (!profileSpaceId) return null;

  return (
    <SharedAvailabilityModal
      open
      profileSpaceId={profileSpaceId}
      rescheduleRequestId={rescheduleRequestId}
      via={via}
      onClose={() => setProfileSpaceId(null)}
      onNotAPerson={dismissNotAPerson}
    />
  );
}

/**
 * The booking modal, reached by profile rather than by geo-chat user id.
 *
 * A link carries the profile's space id, and the week is keyed by user id, which only geo-chat's
 * debate profile knows. That answers signed out too, so whether the person can be booked at all is
 * settled before anyone is asked to sign in; the week itself is viewer-relative and needs them to.
 * Everything before that is drawn inside one dialog, so the recipient never sees it swap under them.
 *
 * The owner opening their own link gets their schedule editor instead: there is nobody to book, and
 * the likeliest reason to open it is checking what it shows.
 */
export function SharedAvailabilityModal({
  open,
  profileSpaceId,
  rescheduleRequestId = null,
  via = null,
  onClose,
  onNotAPerson,
}: {
  open: boolean;
  profileSpaceId: string;
  /** Picking a slot moves this scheduled request rather than proposing a new one. */
  rescheduleRequestId?: string | null;
  /** The link's `via` attribution, for analytics. */
  via?: string | null;
  onClose: () => void;
  /** The space loaded and is not a person's. Only a hand-edited link gets here. */
  onNotAPerson: () => void;
}) {
  const { ready, authenticated } = useGeoChatAuth();
  // Privy's login renders outside this dialog, and a Radix modal makes everything outside it inert —
  // the login showed but took no clicks or typing. So this steps aside while Privy is up and comes
  // back when it is done, either way.
  const [signingIn, setSigningIn] = React.useState(false);
  const signIn = usePrivySignIn(() => setSigningIn(false), {
    onError: () => setSigningIn(false),
    analytics: {
      component: 'invite_link',
      target_id: profileSpaceId,
      target_type: 'space',
      auth_control: 'book_debate',
      auth_trigger: 'invite_link',
      auth_intent: 'join_debate',
      overlay: 'modal',
    },
    // The trigger was cleared on arrival, so the current URL would not reopen this. A new account
    // goes through onboarding and is sent back here afterwards, and should land on the week again —
    // still carrying the `via` it came with, or that second arrival loses its attribution.
    redirectTo: toAvailability(profileSpaceId, { rescheduleRequestId, via: via ?? undefined }),
  });
  // Whether this is a person at all, and the only name there is for a signed-out recipient — who is
  // who this link is mostly for. `null` is a space that does not exist, which is not a person either.
  const { space, isError: spaceError } = useSpace(profileSpaceId);
  const spaceKnown = space !== undefined;
  const isPerson = Spaces.isPersonProfileSpace(space);

  React.useEffect(() => {
    if (spaceKnown && !isPerson) onNotAPerson();
  }, [spaceKnown, isPerson, onNotAPerson]);

  // Nothing to ask geo-chat about a space that is not a person. Asked signed out too, so a person
  // who cannot be booked is found out *before* the recipient is sent to sign in for them. Held for
  // Privy, whose answer changes the key — asking before it would ask twice.
  const profile = useDebateProfile(profileSpaceId, open && isPerson && ready, { signedOut: true });
  const { personalSpaceId } = usePersonalSpaceId();
  const person = profile.data?.user;
  const name = person?.display_name || space?.entity?.name || null;
  // The personal space answers first, from the wallet; geo-chat's own say-so covers the rest.
  const isSelf =
    authenticated &&
    ((personalSpaceId !== null && ID.equals(personalSpaceId, profileSpaceId)) || profile.data?.is_self === true);
  // Which dialog this is — the owner's editor or someone's week — can only be drawn once it is
  // known. Drawing the week's shell first would swap it for the editor under a signed-in owner, so
  // nothing shows until then. A failed space read settles it too: there is no one to be.
  const whoseKnown = ready && (spaceError || !authenticated || isSelf || !profile.isPending);

  // Whether the person behind the link can be booked. Read by the notice below and by analytics, so
  // the two cannot disagree. Still `loading` for a space that is not a person: only a hand-edited
  // link lands there, and `onNotAPerson` takes it away.
  const peer = spaceError
    ? 'error'
    : !isPerson || profile.isPending
      ? 'loading'
      : isDebateProfileMissing(profile.error)
        ? 'no_debate_profile'
        : profile.isError || !person
          ? 'error'
          : 'bookable';

  // Once per landing. Signing in from here keeps this mounted, so it is still the same arrival; a
  // new account sent round onboarding comes back through the link, and that is a second one.
  const settledPeer = peer === 'loading' ? null : peer;
  useEffectOnceWhen(open && (isSelf || (whoseKnown && settledPeer !== null)), () =>
    debateAvailabilityLinkOpened({
      viewer: isSelf ? 'self' : authenticated ? 'other' : 'signed_out',
      peer: isSelf ? null : settledPeer,
      rescheduling: rescheduleRequestId !== null,
      via,
    })
  );

  if (isSelf) {
    return <OwnScheduleModal open={open} onOpenChange={next => !next && onClose()} surface="availability_link" />;
  }
  if (!whoseKnown) return null;

  const notice = (() => {
    if (peer === 'error') return <Notice className="flex-1">Couldn&rsquo;t load their availability.</Notice>;
    // Not a word about signing in until this is known to be a person who can be booked: signing in
    // to be told the link leads nowhere would be the worst way to find out.
    if (peer === 'loading') return <Notice className="flex-1">Loading availability…</Notice>;
    if (peer === 'no_debate_profile') {
      return <Notice className="flex-1">{name ?? 'This person'} hasn&rsquo;t set up debates yet.</Notice>;
    }
    if (!authenticated) {
      return (
        <Notice
          className="flex-1"
          action={
            <button
              type="button"
              {...debateActionAnalyticsAttributes('availability-link', 'Sign in', 'sign_in_for_availability')}
              onClick={() => {
                setSigningIn(true);
                signIn();
              }}
              className="rounded-full bg-text px-4 py-1.5 text-metadata text-white transition-opacity hover:opacity-90"
            >
              Sign in
            </button>
          }
        >
          Sign in to see when {name ?? 'they'} {name ? 'is' : 'are'} free and request a time to debate.
        </Notice>
      );
    }
    return null;
  })();

  return (
    <PeerAvailabilityBookingModal
      open={open && !signingIn}
      userId={person?.user_id ?? ''}
      peerName={name}
      rescheduleRequestId={rescheduleRequestId}
      entry={rescheduleRequestId ? 'reschedule_link' : 'availability_link'}
      onClose={onClose}
    >
      {notice}
    </PeerAvailabilityBookingModal>
  );
}
