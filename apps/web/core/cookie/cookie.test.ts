// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onConnectionChange } from './cookie';
import { WALLET_SESSION, signWalletSession, verifyWalletSession } from './wallet-session';

const store = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    get: vi.fn((name: string) => (values.has(name) ? { name, value: values.get(name)! } : undefined)),
    has: vi.fn((name: string) => values.has(name)),
    set: vi.fn((name: string, value: string) => void values.set(name, value)),
    delete: vi.fn((name: string) => void values.delete(name)),
  };
});
const verifyToken = vi.hoisted(() => vi.fn<(token: string) => Promise<`0x${string}` | null>>());

vi.mock('next/headers', () => ({ cookies: async () => store }));
vi.mock('./privy-identity-token', () => ({ verifyPrivyIdentityToken: verifyToken }));

const LEGACY = 'walletAddress';
const ADDRESS = '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e';
const OTHER = '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4';

describe('onConnectionChange', () => {
  beforeEach(() => {
    vi.stubEnv('WALLET_SESSION_SECRET', 'test-secret');
    store.values.clear();
    vi.clearAllMocks();
    verifyToken.mockImplementation(async token => (token === 'token-for-address' ? ADDRESS : null));
  });

  afterEach(() => vi.unstubAllEnvs());

  it('issues a signed session for the wallet in a verified token', async () => {
    await expect(onConnectionChange({ type: 'connect', identityToken: 'token-for-address' })).resolves.toBe(ADDRESS);

    expect(store.set).toHaveBeenCalledWith(
      WALLET_SESSION,
      expect.any(String),
      expect.objectContaining({ httpOnly: true })
    );
    expect(verifyWalletSession(store.values.get(WALLET_SESSION))).toBe(ADDRESS);
  });

  // GEO-3107: the caller used to name the address. Now an unverifiable token changes nothing.
  it('does not issue a session for a token that does not verify', async () => {
    await expect(onConnectionChange({ type: 'connect', identityToken: 'forged' })).resolves.toBeNull();

    expect(store.set).not.toHaveBeenCalled();
  });

  it('keeps an existing session when a forged token arrives', async () => {
    store.values.set(WALLET_SESSION, signWalletSession(OTHER)!);

    await expect(onConnectionChange({ type: 'connect', identityToken: 'forged' })).resolves.toBe(OTHER);

    expect(store.set).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  // Any cookie write in a Server Action makes Next re-render the page, and after a deploy that is
  // a full reload (#2672) — so a repeat connect for the same wallet must not write.
  it('does not rewrite a valid session for the same wallet', async () => {
    store.values.set(WALLET_SESSION, signWalletSession(ADDRESS)!);

    await expect(onConnectionChange({ type: 'connect', identityToken: 'token-for-address' })).resolves.toBe(ADDRESS);

    expect(store.set).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('replaces a session for a different wallet', async () => {
    store.values.set(WALLET_SESSION, signWalletSession(OTHER)!);

    await onConnectionChange({ type: 'connect', identityToken: 'token-for-address' });

    expect(verifyWalletSession(store.values.get(WALLET_SESSION))).toBe(ADDRESS);
  });

  it('replaces a hand-written session value', async () => {
    store.values.set(WALLET_SESSION, ADDRESS);

    await onConnectionChange({ type: 'connect', identityToken: 'token-for-address' });

    expect(verifyWalletSession(store.values.get(WALLET_SESSION))).toBe(ADDRESS);
  });

  it('deletes the old unsigned cookie when its holder connects', async () => {
    store.values.set(LEGACY, ADDRESS);

    await onConnectionChange({ type: 'connect', identityToken: 'token-for-address' });

    expect(store.delete).toHaveBeenCalledWith(LEGACY);
    expect(verifyWalletSession(store.values.get(WALLET_SESSION))).toBe(ADDRESS);
  });

  it('does not delete the old cookie on the strength of a forged token', async () => {
    store.values.set(LEGACY, ADDRESS);

    await onConnectionChange({ type: 'connect', identityToken: 'forged' });

    expect(store.delete).not.toHaveBeenCalled();
  });

  it('issues nothing without a signing secret', async () => {
    vi.stubEnv('WALLET_SESSION_SECRET', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(onConnectionChange({ type: 'connect', identityToken: 'token-for-address' })).resolves.toBeNull();

    expect(store.set).not.toHaveBeenCalled();
  });

  it('deletes the session and the old cookie on disconnect', async () => {
    store.values.set(WALLET_SESSION, signWalletSession(ADDRESS)!);
    store.values.set(LEGACY, ADDRESS);

    await expect(onConnectionChange({ type: 'disconnect' })).resolves.toBeNull();

    expect(store.delete).toHaveBeenCalledWith(WALLET_SESSION);
    expect(store.delete).toHaveBeenCalledWith(LEGACY);
  });

  it('does not delete on disconnect when there is no cookie', async () => {
    await onConnectionChange({ type: 'disconnect' });

    expect(store.delete).not.toHaveBeenCalled();
  });
});
