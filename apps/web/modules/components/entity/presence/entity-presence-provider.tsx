import { createRoomContext } from '@liveblocks/react';
import { Component } from 'react';
import { useAccount } from 'wagmi';
import { client } from './entity-presence-client';

export const EntityPresenceContext = createRoomContext<{ address: `0x${string}` | undefined }>(client);

interface Props {
  children: React.ReactNode;
  entityId: string;
}

export function EntityPresenceProvider({ children, entityId }: Props) {
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
    <EntityPresenceErrorBoundary>
      <EntityPresenceContext.RoomProvider id={entityId} initialPresence={{ address: account.address }}>
        {children}
      </EntityPresenceContext.RoomProvider>
    </EntityPresenceErrorBoundary>
  );
}

interface EntityPresenceErrorBoundaryState {
  hasError: boolean;
}

interface EntityPresenceErrorBoundaryProps {
  children: React.ReactNode;
}

export class EntityPresenceErrorBoundary extends Component<
  EntityPresenceErrorBoundaryProps,
  EntityPresenceErrorBoundaryState
> {
  constructor({ children }: Props) {
    super({ children });
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Error in EntityPresenceErrorBoundary', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}
