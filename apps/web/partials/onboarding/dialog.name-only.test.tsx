import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hasSeenAssistantAtom, isChatOpenAtom } from '~/core/state/chat-store';
import { pendingPersonalSpaceAtom } from '~/core/state/pending-personal-space';
import type { SearchResult } from '~/core/types';

import { OnboardingDialog } from './dialog';
import { nameAtom, onboardingNameOnlyAtom, stepAtom, topicIdAtom } from './onboarding-atoms';

const ADDRESS = '0x00000000000000000000000000000000000000a1';
const MATCH_ID = '5c1432e381c74f5e9a7e92db29b875f2';

const mocks = vi.hoisted(() => ({
  matches: [] as SearchResult[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('~/core/hooks/use-onboarding', () => ({
  SUPPRESS_ONBOARDING_PARAM: 'suppressOnboarding',
  useOnboarding: () => ({ isOnboardingVisible: true, hideOnboarding: vi.fn() }),
}));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: ADDRESS } } }),
}));
vi.mock('~/core/hooks/use-media-query', () => ({ useMediaQuery: () => false }));
vi.mock('~/core/sync/use-sync-engine', () => ({ useSyncEngine: () => ({ store: {} }) }));
vi.mock('~/core/sync/orm', () => ({ E: { findFuzzy: vi.fn(async () => mocks.matches) } }));
vi.mock('~/core/browse/fetch-browse-sidebar-data', () => ({
  fetchBrowseSidebarData: vi.fn(async () => ({ featured: [], featuredError: false })),
}));
vi.mock('~/core/sdk/geo-client', () => ({ uploadGeoImage: vi.fn() }));
vi.mock('~/core/wallet/auth-hooks', () => ({ useLogout: () => ({ logout: vi.fn() }) }));
vi.mock('~/core/analytics', () => ({ capture: vi.fn() }));
vi.mock('~/core/auth-attempt', () => ({ trackAuthOnboarding: vi.fn() }));

function match(): SearchResult {
  return {
    id: MATCH_ID,
    name: 'Ada Lovelace',
    description: null,
    spaces: [],
    types: [{ id: SystemIds.PERSON_TYPE, name: 'Person' }],
  };
}

function renderDialog(nameOnly: boolean) {
  const store = createStore();
  store.set(onboardingNameOnlyAtom, nameOnly);
  store.set(stepAtom, 'start');
  store.set(nameAtom, 'Ada Lovelace');
  store.set(topicIdAtom, '');
  store.set(pendingPersonalSpaceAtom, null);
  store.set(hasSeenAssistantAtom, false);
  store.set(isChatOpenAtom, false);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Provider store={store}>
        <OnboardingDialog />
      </Provider>
    </QueryClientProvider>
  );
  return store;
}

async function pressContinue() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  });
}

beforeEach(() => {
  mocks.matches = [];
  localStorage.clear();
});
afterEach(cleanup);

describe('OnboardingDialog name-only run (GEO-3517)', () => {
  it('finishes after the name when nothing on Geo shares it', async () => {
    const store = renderDialog(true);
    await pressContinue();

    expect(store.get(stepAtom)).toBe('completed');
    expect(store.get(pendingPersonalSpaceAtom)).toMatchObject({ address: ADDRESS, status: 'pending' });
  });

  it('goes on to the spaces step without the flag', async () => {
    const store = renderDialog(false);
    await pressContinue();

    expect(store.get(stepAtom)).toBe('interested-in');
    expect(store.get(pendingPersonalSpaceAtom)).toBeNull();
  });

  it('finishes from "Is this you?" when the match is skipped', async () => {
    mocks.matches = [match()];
    const store = renderDialog(true);
    await pressContinue();
    expect(store.get(stepAtom)).toBe('existing-entity-match');

    await pressContinue();

    expect(store.get(stepAtom)).toBe('completed');
    expect(store.get(pendingPersonalSpaceAtom)?.topicId).not.toBe(MATCH_ID);
  });

  it('finishes from "Is this you?" with the claimed entity, skipping feed topics', async () => {
    mocks.matches = [match()];
    const store = renderDialog(true);
    await pressContinue();

    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    await pressContinue();

    expect(store.get(stepAtom)).toBe('completed');
    expect(store.get(pendingPersonalSpaceAtom)?.topicId).toBe(MATCH_ID);
  });

  it('claims into feed topics without the flag', async () => {
    mocks.matches = [match()];
    const store = renderDialog(false);
    await pressContinue();

    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    await pressContinue();

    expect(store.get(stepAtom)).toBe('customize-feed');
  });

  it('does not open the assistant over the page, and leaves it to introduce itself later', async () => {
    const store = renderDialog(true);
    await pressContinue();

    expect(store.get(stepAtom)).toBe('completed');
    expect(store.get(isChatOpenAtom)).toBe(false);
    expect(store.get(hasSeenAssistantAtom)).toBe(false);
  });

  it('opens the assistant on a full run', async () => {
    const store = renderDialog(false);
    mocks.matches = [match()];
    await pressContinue();
    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    await pressContinue();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Skip for now|Create profile/ }));
    });

    expect(store.get(isChatOpenAtom)).toBe(true);
  });

  it('hides the step dots, which would count through steps it skips', () => {
    renderDialog(true);
    expect(screen.queryByTestId('onboarding-step-dots')).not.toBeInTheDocument();
  });

  it('shows the step dots on a full run', () => {
    renderDialog(false);
    expect(screen.getByTestId('onboarding-step-dots')).toBeInTheDocument();
  });
});
