import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoConnectButton } from './wallet';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  prepareOnboarding: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  WagmiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGeoLogin: () => ({ login: mocks.login }),
}));
vi.mock('@geogenesis/auth/wallet', () => ({
  createGeoWalletConfig: () => ({}),
  createMockConfig: () => ({}),
}));
vi.mock('../analytics', () => ({ trackPrivyAuth: vi.fn() }));
vi.mock('../environment', () => ({
  Environment: {
    variables: { isTestEnv: true, walletConnectProjectId: '' },
    getConfig: () => ({ rpc: '' }),
  },
}));
vi.mock('../hooks/use-prepare-onboarding', () => ({
  usePrepareOnboarding: () => mocks.prepareOnboarding,
}));
vi.mock('./geo-chain', () => ({ GEOGENESIS: {} }));

afterEach(cleanup);

describe('GeoConnectButton', () => {
  it('matches the Debate button height on mobile', () => {
    render(<GeoConnectButton />);

    expect(screen.getByRole('button', { name: 'Log in' })).toHaveClass('sm:h-7', 'sm:py-0');
  });
});
