// @vitest-environment node
import { type JWTPayload, SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { verifyPrivyIdentityToken } from './privy-identity-token';

const APP_ID = 'test-app';
const EMBEDDED = '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e';
const EXTERNAL = '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4';

const embeddedWallet = { type: 'wallet', wallet_client_type: 'privy', chain_type: 'ethereum', address: EMBEDDED };
const externalWallet = { type: 'wallet', wallet_client_type: 'metamask', chain_type: 'ethereum', address: EXTERNAL };

let privyKey: CryptoKey;
let strangerKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const privy = await generateKeyPair('ES256');
  const stranger = await generateKeyPair('ES256');
  privyKey = privy.privateKey;
  strangerKey = stranger.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(privy.publicKey)), kid: 'privy', alg: 'ES256' }] });
});

type TokenOptions = { claims?: JWTPayload; key?: CryptoKey; issuer?: string; audience?: string; expiresIn?: string };

function token({ claims, key, issuer = 'privy.io', audience = APP_ID, expiresIn = '1h' }: TokenOptions = {}) {
  return new SignJWT({ linked_accounts: JSON.stringify([externalWallet, embeddedWallet]), ...claims })
    .setProtectedHeader({ alg: 'ES256', kid: 'privy' })
    .setSubject('did:privy:user')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key ?? privyKey);
}

const verify = (value: string) => verifyPrivyIdentityToken(value, { appId: APP_ID, keys });

describe('verifyPrivyIdentityToken', () => {
  it("returns the user's embedded wallet from a valid token, ignoring other linked wallets", async () => {
    await expect(verify(await token())).resolves.toBe(EMBEDDED);
  });

  it('accepts linked_accounts as an array as well as a JSON string', async () => {
    await expect(verify(await token({ claims: { linked_accounts: [embeddedWallet] } }))).resolves.toBe(EMBEDDED);
  });

  it('rejects a token not signed by Privy', async () => {
    await expect(verify(await token({ key: strangerKey }))).resolves.toBeNull();
  });

  it('rejects a token issued for another app', async () => {
    await expect(verify(await token({ audience: 'another-app' }))).resolves.toBeNull();
  });

  it('rejects a token from another issuer', async () => {
    await expect(verify(await token({ issuer: 'evil.example' }))).resolves.toBeNull();
  });

  it('rejects an expired token', async () => {
    await expect(verify(await token({ expiresIn: '-1m' }))).resolves.toBeNull();
  });

  it('returns null when the user has no embedded wallet', async () => {
    const onlyExternal = await token({ claims: { linked_accounts: JSON.stringify([externalWallet]) } });

    await expect(verify(onlyExternal)).resolves.toBeNull();
  });

  it('returns null for garbage', async () => {
    await expect(verify('not.a.jwt')).resolves.toBeNull();
    await expect(verify('')).resolves.toBeNull();
  });
});
