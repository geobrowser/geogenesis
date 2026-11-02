'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivy } from '~/core/wallet/auth-hooks';

import {
  type NotificationPreferences,
  type NotificationPreferencesPatch,
  geoNotificationsApiUrl,
  getNotificationPreferences,
  registerForNotifications,
  updateNotificationPreferences,
} from './api';
import type { EmailGroup } from './email-groups';
import { emailPreferenceChanged } from './email-settings-analytics';

export const notificationQueryKeys = {
  registration: (privyUserId: string | null, personalSpaceId: string | null) =>
    ['notifications', 'registration', privyUserId, personalSpaceId] as const,
  preferences: (privyUserId: string | null) => ['notifications', 'preferences', privyUserId] as const,
};

async function accessToken(getAccessToken: () => Promise<string | null>) {
  const token = await getAccessToken();
  if (!token) throw new Error('No Privy access token');
  return token;
}

/**
 * Registers the signed-in person with geo-notifications, once per Privy user and personal space.
 *
 * A query rather than an effect so the app-wide mount and the account menu share one request and one
 * answer. It never throws into the tree: a failure is an error state the menu reads as "unavailable",
 * and signing in is unaffected, which the ticket requires.
 */
export function useNotificationRegistration() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { personalSpaceId } = usePersonalSpaceId();
  const baseUrl = geoNotificationsApiUrl();
  const privyUserId = user?.id ?? null;

  return useQuery({
    queryKey: notificationQueryKeys.registration(privyUserId, personalSpaceId),
    queryFn: async () => registerForNotifications(baseUrl!, await accessToken(getAccessToken), personalSpaceId!),
    enabled: baseUrl !== null && ready && authenticated && privyUserId !== null && personalSpaceId !== null,
    // Once per login is the contract; the upsert is idempotent, so a refetch would only repeat it.
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

/** Mounted once, app-wide, so a person is registered on login whether or not they open the menu. */
export function NotificationRegistration() {
  useNotificationRegistration();
  return null;
}

/**
 * The person's preferences, read from the server, not remembered locally: someone who switched email
 * off from an email footer sees it off here. Waits for registration, because the service answers
 * 403 for a Privy user it has not registered yet.
 */
export function useNotificationPreferences() {
  const { user, getAccessToken } = usePrivy();
  const registration = useNotificationRegistration();
  const baseUrl = geoNotificationsApiUrl();
  const privyUserId = user?.id ?? null;

  const preferences = useQuery({
    queryKey: notificationQueryKeys.preferences(privyUserId),
    queryFn: async () => getNotificationPreferences(baseUrl!, await accessToken(getAccessToken)),
    enabled: baseUrl !== null && registration.isSuccess,
  });

  return { registration, preferences };
}

/** One switch in email settings: the all-email switch, or a group. */
export type EmailSwitch = { group: 'all' | EmailGroup; enabled: boolean };

function patchFor({ group, enabled }: EmailSwitch): NotificationPreferencesPatch {
  return group === 'all' ? { email_enabled: enabled } : { email_groups: { [group]: enabled } };
}

function applySwitch(preferences: NotificationPreferences, { group, enabled }: EmailSwitch): NotificationPreferences {
  if (group === 'all') return { ...preferences, email_enabled: enabled };
  if (!preferences.email_groups) return preferences;
  return { ...preferences, email_groups: { ...preferences.email_groups, [group]: enabled } };
}

function switchValue(preferences: NotificationPreferences, group: EmailSwitch['group']): boolean | undefined {
  return group === 'all' ? preferences.email_enabled : preferences.email_groups?.[group];
}

const SAVE_EMAIL_SWITCH_KEY = ['notifications', 'save-email-switch'] as const;

/** What the settings dialog says about saving: nothing yet, the last change saved, or one didn't. */
export type EmailSaveStatus = 'idle' | 'saved' | 'failed';

/**
 * Saves email switches (GEO-3392). Optimistic, so a switch moves at once, and put back if its save
 * fails: a switch that silently did not save is worse than one that is slow.
 *
 * Switches save independently and can be in flight together, so:
 * - a failure puts back only its own switch;
 * - the server's answer is written over the cache only by the last save to finish (an earlier answer
 *   would not yet hold the later switch and would flick it back for a moment), and when that last
 *   one failed the preferences are read again, because put-back values from overlapping presses of
 *   one switch can't say what the server holds;
 * - `status` is kept here, where every save's outcome arrives. React Query runs a `mutate(…, { onError })`
 *   callback only for the latest call, so a caller's status would miss a failure that settled while
 *   another switch was saving. A failure stays reported until a switch pressed after it saves.
 */
export function useSaveEmailSwitch() {
  const queryClient = useQueryClient();
  const { user, getAccessToken } = usePrivy();
  const baseUrl = geoNotificationsApiUrl();
  const key = notificationQueryKeys.preferences(user?.id ?? null);
  const [status, setStatus] = React.useState<EmailSaveStatus>('idle');
  const presses = React.useRef(0);
  const pressesAtLastFailure = React.useRef(0);

  const isLastInFlight = () => queryClient.isMutating({ mutationKey: SAVE_EMAIL_SWITCH_KEY }) <= 1;

  const mutation = useMutation<
    NotificationPreferences,
    Error,
    EmailSwitch & { press: number },
    { previous: boolean | undefined }
  >({
    mutationKey: SAVE_EMAIL_SWITCH_KEY,
    mutationFn: async change =>
      updateNotificationPreferences(baseUrl!, await accessToken(getAccessToken), patchFor(change)),
    onMutate: async change => {
      await queryClient.cancelQueries({ queryKey: key });
      const current = queryClient.getQueryData<NotificationPreferences>(key);
      if (current) queryClient.setQueryData<NotificationPreferences>(key, applySwitch(current, change));
      return { previous: current ? switchValue(current, change.group) : undefined };
    },
    onError: (_error, change, context) => {
      pressesAtLastFailure.current = presses.current;
      setStatus('failed');
      const current = queryClient.getQueryData<NotificationPreferences>(key);
      if (current && context?.previous !== undefined) {
        queryClient.setQueryData<NotificationPreferences>(
          key,
          applySwitch(current, { group: change.group, enabled: context.previous })
        );
      }
      // This save still counts as mutating here; any more than one means another is in flight.
      if (isLastInFlight()) void queryClient.invalidateQueries({ queryKey: key });
    },
    onSuccess: (saved, change) => {
      emailPreferenceChanged({ group: change.group, enabled: change.enabled, surface: 'settings' });
      if (change.press > pressesAtLastFailure.current) setStatus('saved');
      if (isLastInFlight()) queryClient.setQueryData(key, saved);
    },
  });

  const { mutate } = mutation;
  const save = React.useCallback(
    (change: EmailSwitch) => {
      presses.current += 1;
      mutate({ ...change, press: presses.current });
    },
    [mutate]
  );

  return { save, status };
}
