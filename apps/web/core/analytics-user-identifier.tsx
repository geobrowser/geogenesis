'use client';

import { usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';

import { identifyPrivyUser, restorePrivySession } from './analytics';

export function AnalyticsUserIdentifier() {
  const { ready, authenticated, user } = usePrivy();
  const { personalSpaceId, isFetched } = usePersonalSpaceId();
  const lastIdentityKey = React.useRef<string | null>(null);
  const restoredUserId = React.useRef<string | null>(null);
  const sawReadyUnauthenticated = React.useRef(false);

  React.useEffect(() => {
    if (!ready || !authenticated || !user) {
      lastIdentityKey.current = null;
      return;
    }

    const identityKey = `${user.id}:${personalSpaceId ?? ''}`;

    if (lastIdentityKey.current === identityKey) {
      return;
    }

    lastIdentityKey.current = identityKey;

    identifyPrivyUser(user, {
      personal_space_id: personalSpaceId ?? undefined,
      personal_space_registered: isFetched ? Boolean(personalSpaceId) : undefined,
    });
  }, [ready, authenticated, user, personalSpaceId, isFetched]);

  React.useEffect(() => {
    if (!ready) {
      return;
    }

    if (!authenticated) {
      sawReadyUnauthenticated.current = true;
      restoredUserId.current = null;
      return;
    }

    if (!user) {
      return;
    }

    if (sawReadyUnauthenticated.current || !user.id || restoredUserId.current === user.id) {
      return;
    }

    restoredUserId.current = user.id;
    restorePrivySession(user);
  }, [ready, authenticated, user]);

  return null;
}
