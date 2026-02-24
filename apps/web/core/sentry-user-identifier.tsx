'use client';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { setTelemetryUser } from '~/core/telemetry/logger';

/**
 * Synchronizes Sentry user context with the current user's personal space ID.
 * Sets the user when authenticated, clears it on logout.
 *
 * Rendered inside the provider tree where wallet/react-query hooks are available.
 */
export function SentryUserIdentifier() {
  const { personalSpaceId } = usePersonalSpaceId();

  React.useEffect(() => {
    if (personalSpaceId) {
      setTelemetryUser({ id: personalSpaceId });
    } else {
      setTelemetryUser(null);
    }
  }, [personalSpaceId]);

  return null;
}
