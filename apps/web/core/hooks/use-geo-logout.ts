'use client';

import { useLogout } from '@geogenesis/auth';
import { useQueryClient } from '@tanstack/react-query';

import { useSetAtom } from 'jotai';

import { loggedOut } from '~/core/analytics';
import { Cookie } from '~/core/cookie';
import { resetGeoChatAuthState } from '~/core/debates/api';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useEditable } from '~/core/state/editable-store';
import { pendingPersonalSpaceAtom } from '~/core/state/pending-personal-space';

import { avatarAtom, nameAtom, spaceIdAtom, stepAtom, topicIdAtom } from '~/partials/onboarding/dialog';

import { dismissedHintsAtom } from '~/atoms/dismissed-hints';

/**
 * Registers the side-effects that wipe every trace of the previous account on
 * sign-out: edit mode, the wallet cookie, onboarding atoms, the optimistic
 * pending space, the query cache, and finally a hard reload. The reload is the
 * load-bearing step: clearing the in-memory cache loses the race against the
 * still-connected wagmi/Privy state, which refetches the old wallet's sidebar
 * "editor of"/"member of" spaces before disconnect propagates. A fresh document
 * load reads the now-cleared cookie and the disconnected wallet, so nothing
 * repopulates.
 *
 * Privy's `useLogout` subscribes its callback to a global logout event, so
 * EVERY mounted subscriber's onSuccess fires on any logout. Call this exactly
 * once at the app root — components that need to trigger a logout use a bare
 * `useLogout()` instead. Anything else double-runs the cleanup and analytics.
 */
export function useGeoLogoutCleanup() {
  const { personalSpaceId } = usePersonalSpaceId();
  const { setEditable } = useEditable();
  const queryClient = useQueryClient();

  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);
  const setDismissedHints = useSetAtom(dismissedHintsAtom);
  const setPending = useSetAtom(pendingPersonalSpaceAtom);

  useLogout({
    onSuccess: async () => {
      loggedOut({ personal_space_id: personalSpaceId ?? undefined });
      // Drop out of edit mode so the flow bar / "Review edits" popup hides — on
      // sign-out ModeToggle unmounts and can no longer reset `editable` itself.
      setEditable(false);
      await Cookie.onConnectionChange({ type: 'disconnect' });
      setName('');
      setTopicId('');
      setAvatar('');
      setSpaceId('');
      setStep('enter-profile');
      setDismissedHints([]);
      setPending(null);
      resetGeoChatAuthState();
      queryClient.clear();
      // Bulletproof reset — see the doc comment. `/root` is the public home and
      // drops the user out of any onboarding/pending context they logged out of.
      window.location.assign('/root');
    },
  });
}
