import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';

import type * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, expect, it, vi } from 'vitest';

import { ActionContextProvider } from '~/core/action-context-provider';
import { useDeploySpace } from '~/core/hooks/use-deploy-space';
import { pendingCreatedSpaceAtom } from '~/core/state/pending-created-space';

import { CreateSpaceDialog, createSpaceDialogOpenAtom, useOpenCreateSpaceDialog } from './create-space-dialog';
import { PendingCreatedSpaceRunner } from './pending-created-space-runner';

const mocks = vi.hoisted(() => ({ capture: vi.fn(), create: vi.fn(), push: vi.fn() }));
vi.mock('~/core/analytics', () => ({ capture: mocks.capture, analyticsContextRevision: () => 0 }));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: '0x123' } } }),
}));
vi.mock('~/core/utils/contracts/create-personal-space-on-chain', () => ({ createPersonalSpaceOnChain: mocks.create }));
vi.mock('~/core/sdk/geo-client', () => ({ geo: {}, uploadGeoImage: vi.fn() }));
vi.mock('~/core/state/status-bar-store', () => ({ useReportError: () => vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('~/partials/onboarding/dialog', () => ({ Animation: () => null }));
vi.mock('~/design-system/find-entity', () => ({ FindEntity: () => null }));
vi.mock('~/partials/governance/voting-settings-fields', () => ({ VotingSettingsFields: () => null }));
// Only the dialog's enqueue behavior is under test; it runs even when its shell is not rendered.
vi.mock('@radix-ui/react-dialog', () => ({
  Root: () => null,
  Portal: () => null,
  Content: () => null,
  Title: () => null,
  Description: () => null,
}));

afterEach(() => {
  cleanup();
  mocks.capture.mockReset();
  mocks.create.mockReset();
  mocks.push.mockReset();
});

it('carries enqueue-time page, modal and list attribution through the real background runner', async () => {
  const store = createStore();
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  function wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <Provider store={store}>{children}</Provider>
      </QueryClientProvider>
    );
  }
  window.history.replaceState({}, '', '/explore?tab=claims');
  const { result } = renderHook(() => useOpenCreateSpaceDialog(), { wrapper });
  const dialog = render(
    <ActionContextProvider value={{ list_id: 'explore', item_position: 4 }}>
      <CreateSpaceDialog />
    </ActionContextProvider>,
    { wrapper }
  );
  act(() =>
    result.current({
      name: 'Private space name',
      topicId: 'topic',
      spaceType: 'personal',
      step: 'create-space',
      autoRun: true,
    })
  );
  await waitFor(() => expect(store.get(pendingCreatedSpaceAtom)).not.toBeNull());
  expect(store.get(createSpaceDialogOpenAtom)).toBe(false);
  dialog.unmount();
  window.history.replaceState({}, '', '/elsewhere');
  mocks.create.mockResolvedValue('created-space');
  render(<PendingCreatedSpaceRunner />, { wrapper });
  await waitFor(() => expect(mocks.push).toHaveBeenCalled());
  expect(mocks.create).toHaveBeenCalledTimes(1);
  const outcomes = mocks.capture.mock.calls.filter(([event]) => event === 'action_completed');
  expect(outcomes).toHaveLength(1);
  expect(outcomes[0][1]).toMatchObject({
    action_kind: 'create_space',
    outcome: 'succeeded',
    page_path: '/explore',
    overlay: 'modal',
    list_id: 'explore',
    item_position: 4,
    created_space_id: 'created-space',
  });
  expect(JSON.stringify(outcomes)).not.toContain('Private space name');
  expect(store.get(pendingCreatedSpaceAtom)).toBeNull();
});

it('inherits context for direct deploy callers too', async () => {
  const queryClient = new QueryClient();
  function wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ActionContextProvider value={{ overlay: 'modal', list_id: 'direct' }}>{children}</ActionContextProvider>
      </QueryClientProvider>
    );
  }
  mocks.create.mockResolvedValue('created-space');
  const { result } = renderHook(() => useDeploySpace(), { wrapper });
  await act(async () => {
    await result.current.deploy({ type: 'personal', spaceName: 'Name' });
  });
  expect(mocks.capture).toHaveBeenCalledWith(
    'action_completed',
    expect.objectContaining({ overlay: 'modal', list_id: 'direct' })
  );
});
