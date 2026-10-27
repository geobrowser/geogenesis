// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import {
  bearerToken,
  embeddedEthereumWallet,
  privyJwksUrl,
  resetPrivyJwksCacheForTests,
  verifyPrivyIdentityToken,
} from './privy-identity-token';

const APP_ID = 'app-under-test';
const WALLET = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';

const b64url = (bytes: Uint8Array | string) => {
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let binary = '';
  for (const b of raw) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function keyPair(kid: string) {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'ES256', use: 'sig' };
  return { privateKey: pair.privateKey, jwk };
}

async function sign(privateKey: CryptoKey, kid: string, claims: Record<string, unknown>, alg = 'ES256') {
  const header = b64url(JSON.stringify({ alg, typ: 'JWT', kid }));
  const payload = b64url(JSON.stringify(claims));
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      new TextEncoder().encode(`${header}.${payload}`)
    )
  );
  return `${header}.${payload}.${b64url(signature)}`;
}

const now = Math.floor(Date.now() / 1000);
const claims = (overrides: Record<string, unknown> = {}) => ({
  iss: 'privy.io',
  aud: APP_ID,
  sub: 'did:privy:abc',
  iat: now - 10,
  exp: now + 3600,
  linked_accounts: JSON.stringify([
    { type: 'email', address: 'someone@example.com' },
    {
      type: 'wallet',
      address: '0x1111111111111111111111111111111111111111',
      chain_type: 'ethereum',
      wallet_client_type: 'metamask',
    },
    { type: 'wallet', address: WALLET, chain_type: 'ethereum', wallet_client_type: 'privy' },
  ]),
  ...overrides,
});

function jwksFetcher(keys: object[]) {
  const calls: string[] = [];
  const fetcher = (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ keys }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe('verifyPrivyIdentityToken', () => {
  beforeEach(() => resetPrivyJwksCacheForTests());

  it('accepts a valid token and returns the embedded wallet, lowercased', async () => {
    const { privateKey, jwk } = await keyPair('k1');
    const { fetcher, calls } = jwksFetcher([jwk]);
    const token = await sign(privateKey, 'k1', claims());
    await expect(verifyPrivyIdentityToken(token, { appId: APP_ID, fetcher })).resolves.toEqual({
      userId: 'did:privy:abc',
      walletAddress: WALLET.toLowerCase(),
    });
    expect(calls).toEqual([privyJwksUrl(APP_ID)]);
    // Cached: a second verification does not refetch.
    await verifyPrivyIdentityToken(token, { appId: APP_ID, fetcher });
    expect(calls).toHaveLength(1);
  });

  it('rejects a token signed by another key', async () => {
    const { jwk } = await keyPair('k1');
    const { privateKey: forger } = await keyPair('k1');
    const { fetcher } = jwksFetcher([jwk]);
    const token = await sign(forger, 'k1', claims());
    await expect(verifyPrivyIdentityToken(token, { appId: APP_ID, fetcher })).resolves.toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const { privateKey, jwk } = await keyPair('k1');
    const { fetcher } = jwksFetcher([jwk]);
    const [h, , s] = (await sign(privateKey, 'k1', claims())).split('.');
    const forged = `${h}.${b64url(JSON.stringify(claims({ sub: 'did:privy:someone-else' })))}.${s}`;
    await expect(verifyPrivyIdentityToken(forged, { appId: APP_ID, fetcher })).resolves.toBeNull();
  });

  it.each([
    ['another app', { aud: 'other-app' }],
    ['another issuer', { iss: 'evil.example' }],
    ['expired', { exp: now - 3600 }],
    ['not yet valid', { nbf: now + 3600 }],
    ['no subject', { sub: '' }],
  ])('rejects a token for %s', async (_label, overrides) => {
    const { privateKey, jwk } = await keyPair('k1');
    const { fetcher } = jwksFetcher([jwk]);
    const token = await sign(privateKey, 'k1', claims(overrides));
    await expect(verifyPrivyIdentityToken(token, { appId: APP_ID, fetcher })).resolves.toBeNull();
  });

  it('rejects alg none and garbage without throwing', async () => {
    const { fetcher } = jwksFetcher([]);
    const none = `${b64url(JSON.stringify({ alg: 'none' }))}.${b64url(JSON.stringify(claims()))}.`;
    await expect(verifyPrivyIdentityToken(none, { appId: APP_ID, fetcher })).resolves.toBeNull();
    await expect(verifyPrivyIdentityToken('not.a.jwt', { appId: APP_ID, fetcher })).resolves.toBeNull();
    await expect(verifyPrivyIdentityToken('', { appId: APP_ID, fetcher })).resolves.toBeNull();
    await expect(verifyPrivyIdentityToken(null, { appId: APP_ID, fetcher })).resolves.toBeNull();
  });

  it('refetches keys once for an unknown kid (rotation)', async () => {
    const old = await keyPair('old');
    const rotated = await keyPair('new');
    let served = [old.jwk];
    const calls: string[] = [];
    const fetcher = (async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ keys: served }), { status: 200 });
    }) as unknown as typeof fetch;
    await verifyPrivyIdentityToken(await sign(old.privateKey, 'old', claims()), { appId: APP_ID, fetcher });
    served = [old.jwk, rotated.jwk];
    const result = await verifyPrivyIdentityToken(await sign(rotated.privateKey, 'new', claims()), {
      appId: APP_ID,
      fetcher,
    });
    expect(result?.userId).toBe('did:privy:abc');
    expect(calls).toHaveLength(2);
  });

  it('treats a JWKS outage as unverified, not as an error', async () => {
    const { privateKey } = await keyPair('k1');
    const fetcher = (async () => new Response('down', { status: 503 })) as unknown as typeof fetch;
    const token = await sign(privateKey, 'k1', claims());
    await expect(verifyPrivyIdentityToken(token, { appId: APP_ID, fetcher })).resolves.toBeNull();
  });
});

describe('embeddedEthereumWallet', () => {
  it('ignores external wallets and accepts the claim as a string or an array', () => {
    expect(embeddedEthereumWallet(claims().linked_accounts)).toBe(WALLET.toLowerCase());
    expect(
      embeddedEthereumWallet([
        { type: 'wallet', address: WALLET, chain_type: 'ethereum', wallet_client_type: 'metamask' },
      ])
    ).toBeNull();
    expect(embeddedEthereumWallet('not json')).toBeNull();
  });
});

describe('bearerToken', () => {
  it('reads a bearer header', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer  x ')).toBe('x');
    expect(bearerToken('Basic x')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
