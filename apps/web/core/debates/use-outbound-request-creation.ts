'use client';

import { useIsMutating } from '@tanstack/react-query';

import { useGeoChatAuth } from './hooks';
import { outboundRequestCreationMutationKey } from './request-gate';

/** Whether either outbound request API is currently submitting for this query-client/account scope. */
export function useOutboundRequestCreationPending(): boolean {
  const { accountKey } = useGeoChatAuth();
  return useIsMutating({ mutationKey: outboundRequestCreationMutationKey(accountKey), exact: true }) > 0;
}
