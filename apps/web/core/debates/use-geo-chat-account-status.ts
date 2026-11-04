'use client';

import * as React from 'react';

import {
  type GeoChatAccountStatus,
  type GeoChatViewerProfile,
  getGeoChatAccountStatus,
  subscribeGeoChatAccountStatus,
} from './geo-chat-account-status';
import { useGeoChatAuth } from './hooks';

export function useGeoChatAccountStatus(accountKey: string | null): GeoChatAccountStatus {
  return React.useSyncExternalStore(
    subscribeGeoChatAccountStatus,
    () => getGeoChatAccountStatus(accountKey),
    () => getGeoChatAccountStatus(null)
  );
}

/** The signed-in viewer's own profile from their geo-chat session. `null` before geo-chat sends one. */
export function useGeoChatViewer(): GeoChatViewerProfile | null {
  const { ready, authenticated, accountKey } = useGeoChatAuth();
  const status = useGeoChatAccountStatus(ready && authenticated ? accountKey : null);
  return status.kind === 'accepted' ? (status.viewer ?? null) : null;
}
