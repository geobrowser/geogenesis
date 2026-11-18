import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Sign-in entry points against the real auth seam. Only Privy is faked, with a start-up time each
 * test picks: a Privy that is ready on mount hides a slow or blocked one.
 */

const mocks = vi.hoisted(() => ({
  privyReady: false,
  setPrivyReady: null as null | ((ready: boolean) => void),
  privyLogin: vi.fn(),
  sendCode: vi.fn(async (_: { email: string }) => undefined),
  loginWithCode: vi.fn(async () => undefined),
  captured: [] as string[],
  reports: [] as { name: string; level?: string; tags?: Record<string, unknown>; extra?: Record<string, unknown> }[],
}));

vi.mock('@geogenesis/auth', async () => {
  const React = await import('react');
  const listeners = new Set<() => void>();
  const ready = () => mocks.privyReady;
  mocks.setPrivyReady = (value: boolean) => {
    mocks.privyReady = value;
    listeners.forEach(listener => listener());
  };
  const useReady = () =>
    React.useSyncExternalStore(listener => (listeners.add(listener), () => listeners.delete(listener)), ready, ready);
  return {
    PrivyProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    WagmiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    usePrivy: () => ({
      ready: useReady(),
      authenticated: false,
      user: null,
      isModalOpen: false,
      login: mocks.privyLogin,
      logout: vi.fn(),
      getAccessToken: async () => null,
    }),
    useWallets: () => ({ wallets: [], ready: useReady() }),
    useIdentityToken: () => ({ identityToken: null }),
    useWalletClient: () => ({ data: undefined, isLoading: false }),
    useGeoLogin: () => ({ login: mocks.privyLogin }),
    usePrivyLogin: () => ({ login: mocks.privyLogin }),
    useLogout: () => ({ logout: vi.fn() }),
    useLoginWithEmail: () => ({
      state: { status: 'initial' },
      sendCode: mocks.sendCode,
      loginWithCode: mocks.loginWithCode,
    }),
    useLoginWithOAuth: () => ({ initOAuth: vi.fn(), state: { status: 'initial' }, loading: false }),
    useAccountEffect: vi.fn(),
    useEnsureEmbeddedWallet: vi.fn(),
    getIdentityToken: vi.fn(async () => null),
  };
});
vi.mock('@geogenesis/auth/wallet', () => ({ createGeoWalletConfig: () => ({}), createMockConfig: () => ({}) }));
vi.mock('~/core/wallet/embedded-wallet-sync', () => ({ EmbeddedWalletSync: () => null }));
vi.mock('~/core/wallet/wallet-provider', () => ({
  WalletProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('~/core/analytics', async importOriginal => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return { ...real, capture: (event: string) => void mocks.captured.push(event) };
});
vi.mock('~/core/telemetry/logger', async importOriginal => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return { ...real, reportEvent: (event: (typeof mocks.reports)[number]) => void mocks.reports.push(event) };
});
// Deep links this test is not about, each with its own data fetching.
vi.mock('~/core/debates/use-debates-panel-deep-link', () => ({ useDebatesPanelDeepLink: () => {} }));
vi.mock('~/core/debates/rooms/use-room-access-deep-link', () => ({ useRoomAccessDeepLink: () => {} }));
vi.mock('~/partials/availability/shared-availability', () => ({ AvailabilityDeepLink: () => null }));
vi.mock('~/core/hooks/use-prepare-onboarding', () => ({ usePrepareOnboarding: () => vi.fn() }));

const { AuthRoot } = await import('~/core/wallet/auth-root');
const { realPrivyReady, resetAuthStore } = await import('~/core/wallet/auth-store');
// Loaded up front so the host's dynamic import resolves within a test's first ticks.
await import('~/core/wallet/privy-host');
const { DeepLinkHandler } = await import('~/partials/deep-links/deep-link-handler');
const { SignInBoxHost } = await import('~/partials/sign-in/sign-in-box');
const { GeoConnectButton } = await import('~/core/wallet/wallet');
const { SaveVotesSheet } = await import('~/partials/save-votes/save-votes-sheet');
const { castLocalVote } = await import('~/core/state/cast-local-vote');
const { clearLocalVotes } = await import('~/core/state/local-votes');
const { snapshotActionContext } = await import('~/core/action-context');
const { resetAuthAttempt } = await import('~/core/auth-attempt');
const { resetSignInReports, PROMPT_TIMEOUT_MS, PRIVY_READY_TIMEOUT_MS } = await import('~/core/auth/sign-in-reports');
const { closeSignInBox } = await import('~/core/auth/sign-in-box/sign-in-box-store');
const { closeSaveVotesPrompt } = await import('~/core/state/save-votes-prompt');

const MARKETING_LINK = '/explore?modal=signin&via=marketing&marketing_page=home';
const NEVER = Number.POSITIVE_INFINITY;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocks.privyReady = false;
  mocks.privyLogin.mockReset();
  mocks.sendCode.mockReset().mockResolvedValue(undefined);
  mocks.captured.length = 0;
  mocks.reports.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  resetAuthStore();
  resetAuthAttempt();
  resetSignInReports();
  closeSignInBox();
  closeSaveVotesPrompt();
  clearLocalVotes();
  window.history.replaceState(null, '', '/explore');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Lets the Privy host's dynamic import settle, then starts Privy `startsInMs` later. */
async function startPrivy(startsInMs: number) {
  for (let i = 0; i < 20; i++) await advance(5);
  if (startsInMs === NEVER) return;
  await advance(startsInMs);
  await act(async () => mocks.setPrivyReady!(true));
  await vi.waitFor(() => expect(realPrivyReady()).toBe(true));
  await advance(50);
}

function renderApp(extra?: React.ReactNode) {
  return render(
    <>
      <AuthRoot />
      <DeepLinkHandler />
      <SignInBoxHost />
      {extra}
    </>
  );
}

function reportsNamed(name: string) {
  return mocks.reports.filter(report => report.name === name);
}

async function submitEmail(email = 'visitor@example.com') {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } });
  await act(async () => {
    fireEvent.submit(screen.getByLabelText('Email address').closest('form')!);
  });
}

/** `opensAttempt`: the attempt opens with the box; the save-votes sheet opens it at the email submit. */
type Entry = { name: string; open: () => Promise<void>; opensAttempt: boolean };

const entries: Entry[] = [
  {
    name: 'marketing link',
    opensAttempt: true,
    open: async () => {
      window.history.replaceState(null, '', MARKETING_LINK);
      renderApp();
    },
  },
  {
    name: 'navbar Log in',
    opensAttempt: true,
    open: async () => {
      renderApp(<GeoConnectButton />);
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Log in' })));
    },
  },
  {
    name: 'save-votes prompt',
    opensAttempt: false,
    open: async () => {
      renderApp(<SaveVotesSheet />);
      await act(async () => {
        castLocalVote({
          entityId: 'claim-1',
          spaceId: 'space-1',
          responseKind: 'curation',
          direction: 'positive',
          title: 'Claim one',
          surface: 'feed',
          attribution: snapshotActionContext('claim_position_control', 'claim', 'claim-1'),
        });
      });
    },
  },
];

describe.each(entries)('sign-in from the $name, new visitor', entry => {
  it('shows the box at once and sends the code once a slow Privy starts', async () => {
    await entry.open();
    await advance(1_000);
    expect(screen.getByLabelText('Email address')).toBeVisible();
    if (entry.opensAttempt) expect(mocks.captured).toContain('auth_prompt_viewed');

    await submitEmail();
    expect(mocks.captured).toContain('auth_prompt_viewed');
    expect(mocks.sendCode).not.toHaveBeenCalled();
    await startPrivy(5_000);
    expect(mocks.sendCode).toHaveBeenCalledWith({ email: 'visitor@example.com' });
    await advance(PRIVY_READY_TIMEOUT_MS);
    expect(mocks.reports).toEqual([]);
  });

  it('reports to Sentry when Privy never starts', async () => {
    await entry.open();
    await advance(1_000);
    await submitEmail();
    await startPrivy(NEVER);
    await advance(PRIVY_READY_TIMEOUT_MS);

    expect(reportsNamed('sign_in_privy_not_ready')).toHaveLength(1);
    expect(reportsNamed('sign_in_load_failed')).toEqual([
      expect.objectContaining({
        level: 'error',
        tags: expect.objectContaining({ privy_loaded: false, privy_requested: true, reason: 'call_timeout' }),
        extra: expect.objectContaining({ call: 'send_code' }),
      }),
    ]);
    expect(mocks.sendCode).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t reach sign-in');
  });
});

describe('the 20 Oct marketing link', () => {
  // Version-neutral: on #2930 the prompt was Privy's own dialog (`login`), now it is the box.
  // On bd13e6b7c with Privy starting after 25 s this fails: `login` waited 20 s and gave up.
  it('puts a sign-in prompt on screen within 8 s even when Privy takes 25 s', async () => {
    window.history.replaceState(null, '', MARKETING_LINK);
    renderApp();
    await advance(PROMPT_TIMEOUT_MS);
    const prompted = mocks.captured.includes('auth_prompt_viewed') || mocks.privyLogin.mock.calls.length > 0;
    expect(prompted).toBe(true);
    await startPrivy(25_000 - PROMPT_TIMEOUT_MS);
    expect(reportsNamed('sign_in_prompt_timeout')).toEqual([]);
  });
});

describe('a sign-in that never reaches the screen', () => {
  it('reports sign_in_prompt_timeout once when no box host is mounted', async () => {
    render(
      <>
        <AuthRoot />
        <GeoConnectButton />
      </>
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Log in' })));
    await advance(PROMPT_TIMEOUT_MS + 1_000);
    await startPrivy(5_000);
    await advance(PRIVY_READY_TIMEOUT_MS);

    expect(reportsNamed('sign_in_prompt_timeout')).toEqual([
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({ component: 'navbar', sign_in_surface: 'box' }),
      }),
    ]);
    expect(reportsNamed('sign_in_load_failed')).toEqual([]);
  });
});
