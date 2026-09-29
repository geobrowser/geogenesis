'use client';

import { usePrivy } from '@geogenesis/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';

import {
  type NotificationPreferences,
  geoNotificationsApiUrl,
  getNotificationPreferences,
  registerForNotifications,
  updateNotificationPreferences,
} from './api';

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

/**
 * Turns notification email on or off. Optimistic, so the switch moves at once, and rolled back if the
 * save fails: a switch that silently did not save is worse than one that is slow.
 */
export function useSetEmailNotifications() {
  const queryClient = useQueryClient();
  const { user, getAccessToken } = usePrivy();
  const baseUrl = geoNotificationsApiUrl();
  const key = notificationQueryKeys.preferences(user?.id ?? null);

  return useMutation<NotificationPreferences, Error, boolean, { previous: NotificationPreferences | undefined }>({
    mutationFn: async enabled =>
      updateNotificationPreferences(baseUrl!, await accessToken(getAccessToken), { email_enabled: enabled }),
    onMutate: async enabled => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPreferences>(key);
      if (previous) queryClient.setQueryData<NotificationPreferences>(key, { ...previous, email_enabled: enabled });
      return { previous };
    },
    onError: (_error, _enabled, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: saved => queryClient.setQueryData(key, saved),
  });
}
