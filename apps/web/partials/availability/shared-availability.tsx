'use client';

import * as React from 'react';

import { NOT_A_PERSON_MESSAGE, toAvailability } from '~/core/availability/availability-deep-link';
import { useAvailabilityDeepLink } from '~/core/availability/use-availability-deep-link';
import { useDebateProfile, useGeoChatAuth } from '~/core/debates/hooks';
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
  const setToast = useSetToast();
  const notAPerson = React.useCallback(() => setToast(<span>{NOT_A_PERSON_MESSAGE}</span>), [setToast]);
  useAvailabilityDeepLink(spaceId => (spaceId ? setProfileSpaceId(spaceId) : notAPerson()));
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
      onClose={() => setProfileSpaceId(null)}
      onNotAPerson={dismissNotAPerson}
    />
  );
}

/**
 * The booking modal, reached by profile rather than by geo-chat user id.
 *
 * A link carries the profile's space id, and the week is keyed by user id, which only geo-chat's
 * debate profile knows — and only answers to someone signed in. Everything before that answer is
 * drawn inside the same dialog, so the recipient never sees it swap out from under them.
 *
 * The owner opening their own link gets their schedule editor instead: there is nobody to book, and
 * the likeliest reason to open it is checking what it shows.
 */
export function SharedAvailabilityModal({
  open,
  profileSpaceId,
  onClose,
  onNotAPerson,
}: {
  open: boolean;
  profileSpaceId: string;
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
    // The trigger was cleared on arrival, so the current URL would not reopen this. A new account
    // goes through onboarding and is sent back here afterwards, and should land on the week again.
    redirectTo: toAvailability(profileSpaceId),
  });
  // Whether this is a person at all, and the only name there is for a signed-out recipient — who is
  // who this link is mostly for. `null` is a space that does not exist, which is not a person either.
  const { space, isError: spaceError } = useSpace(profileSpaceId);
  const spaceKnown = space !== undefined;
  const isPerson = Spaces.isPersonProfileSpace(space);

  React.useEffect(() => {
    if (spaceKnown && !isPerson) onNotAPerson();
  }, [spaceKnown, isPerson, onNotAPerson]);

  // Nothing to ask geo-chat about a space that is not a person.
  const profile = useDebateProfile(profileSpaceId, open && isPerson);
  const { personalSpaceId } = usePersonalSpaceId();
  const person = profile.data?.user;
  const name = person?.display_name || space?.entity?.name || null;
  // The personal space answers first, from the wallet; geo-chat's own say-so covers the rest.
  const isSelf =
    authenticated &&
    ((personalSpaceId !== null && ID.equals(personalSpaceId, profileSpaceId)) || profile.data?.is_self === true);

  if (isSelf) return <OwnScheduleModal open={open} onOpenChange={next => !next && onClose()} />;

  const notice = (() => {
    // Before Privy knows, "sign in" would flash at people who already are.
    if (spaceError) return <Notice className="flex-1">Couldn&rsquo;t load their availability.</Notice>;
    // Not a word about signing in until this is known to be a person: signing in to be told the
    // link was never anybody's would be the worst way to find out.
    if (!ready || !isPerson) return <Notice className="flex-1">Loading availability…</Notice>;
    if (!authenticated) {
      return (
        <Notice
          className="flex-1"
          action={
            <button
              type="button"
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
    if (profile.isPending) return <Notice className="flex-1">Loading availability…</Notice>;
    if (profile.isError || !person) return <Notice className="flex-1">Couldn&rsquo;t load their availability.</Notice>;
    return null;
  })();

  return (
    <PeerAvailabilityBookingModal
      open={open && !signingIn}
      userId={person?.user_id ?? ''}
      peerName={name}
      onClose={onClose}
    >
      {notice}
    </PeerAvailabilityBookingModal>
  );
}
