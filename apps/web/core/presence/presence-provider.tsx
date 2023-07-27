'use client';

import * as React from 'react';
import { useEffect } from 'react';
import { createRoomContext } from '@liveblocks/react';
import { useAccount } from 'wagmi';

import { client } from './entity-presence-client';
import { useActionsStore } from '~/core/hooks/use-actions-store';
import { Action } from '~/core/utils/action';
import { ErrorBoundary } from 'react-error-boundary';

export const EntityPresenceContext = createRoomContext<{
  address: `0x${string}` | undefined;
  hasChangesToEntity: boolean;
}>(client);

interface Props {
  children: React.ReactNode;
  entityId: string;
  spaceId: string;
}

// We have a space-specific provider since the logic for presence state works
// differently than for entities. For the space page we want to show _anybody_
// that is in edit mode within the space, not just the current entity. This is
// because they could be editing many different entities at once instead of
// a specific entity.
//
// One workaround is to track which entities a user has made changes to, but
// for now we can just show all editors currently in the space.
export function SpacePresenceProvider({ children, entityId, spaceId }: Props) {
  const account = useAccount();

  // @HACK (baiirun)
  // We don't start the presence provider in our tests since we don't
  // actually test them, and we don't want to waste MAU limits. Vitest
  // uses import.meta.env for environment variables which differs from
  // how nextjs loads them. Here we check if we're in the vitest context
  // and avoid starting the presence provider if we are.
  //
  // An alternative would be to inject the client with context and use a
  // mock version in tests. We end up with a fairly convoluted setup of
  // contexts and providers with Liveblocks, so this janky hack is easier
  // for now.
  // @ts-expect-error import.meta.env is not typed
  if (import.meta?.env) return null;

  return (
    <ErrorBoundary
      fallback={null}
      onError={e => console.error(`Error in SpacePresenceProvider, entityId: ${entityId} spaceId: ${spaceId} ` + e)}
    >
      <EntityPresenceContext.RoomProvider
        id={entityId}
        initialPresence={{ address: account.address, hasChangesToEntity: true }}
      >
        {children}
      </EntityPresenceContext.RoomProvider>
    </ErrorBoundary>
  );
}

export function EntityPresenceProvider({ children, entityId, spaceId }: Props) {
  const account = useAccount();

  // HACK (baiirun)
  // We don't start the presence provider in our tests since we don't
  // actually test them, and we don't want to waste MAU limits. Vitest
  // uses import.meta.env for environment variables which differs from
  // how nextjs loads them. Here we check if we're in the vitest context
  // and avoid starting the presence provider if we are.
  //
  // An alternative would be to inject the client with context and use a
  // mock version in tests. We end up with a fairly convoluted setup of
  // contexts and providers with Liveblocks, so this janky hack is easier
  // for now.
  // @ts-expect-error import.meta.env is not typed
  if (import.meta?.env) return null;

  return (
    <ErrorBoundary
      fallback={null}
      onError={e => console.error(`Error in EntityPresenceProvider, entityId: ${entityId} spaceId: ${spaceId} ` + e)}
    >
      {' '}
      <EntityPresenceContext.RoomProvider
        id={entityId}
        initialPresence={{ address: account.address, hasChangesToEntity: false }}
      >
        <HasEntityChanges entityId={entityId} spaceId={spaceId} address={account.address}>
          {children}
        </HasEntityChanges>
      </EntityPresenceContext.RoomProvider>
    </ErrorBoundary>
  );
}

interface HasEntityChangesProps extends Props {
  address: `0x${string}` | undefined;
}

function HasEntityChanges({ entityId, spaceId, children, address }: HasEntityChangesProps) {
  const { actionsFromSpace } = useActionsStore(spaceId);
  const updateMyPresence = EntityPresenceContext.useUpdateMyPresence();
  const hasChangesToEntity = Action.getChangeCount(Action.forEntityId(actionsFromSpace, entityId)) > 0;

  useEffect(() => {
    updateMyPresence({ address, hasChangesToEntity });
  }, [hasChangesToEntity, address, updateMyPresence]);

  return <>{children}</>;
}
