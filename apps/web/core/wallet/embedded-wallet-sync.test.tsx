import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { EmbeddedWalletSync } from './embedded-wallet-sync';

const mocks = vi.hoisted(() => ({ useEnsureEmbeddedWallet: vi.fn() }));

vi.mock('@geogenesis/auth', () => ({
  useEnsureEmbeddedWallet: () => mocks.useEnsureEmbeddedWallet(),
}));

describe('EmbeddedWalletSync', () => {
  // The whole point is that it is mounted for the life of the app rather than inside whatever
  // started the login. The first version lived in the sign-up card, which unmounts itself the
  // instant `authenticated` turns true — the exact render where the work becomes possible — so it
  // tore itself down before it could run.
  it('runs the wallet wiring and renders nothing', () => {
    const { container } = render(<EmbeddedWalletSync />);

    expect(mocks.useEnsureEmbeddedWallet).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
