import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';
import { getAddress, isAddress } from 'viem';

import { Environment } from '~/core/environment';

/**
 * Verifies a Privy identity token and returns the user's embedded Ethereum wallet.
 *
 * Same checks as geo-chat's `PrivyIdentityTokenVerifier`: ES256, issuer `privy.io`, audience
 * the Privy app id, signed by a key from the app's public JWKS. The token's `linked_accounts`
 * claim is a JSON string, and the embedded wallet is the linked account with
 * `wallet_client_type: 'privy'` on `chain_type: 'ethereum'` — the EOA the space registry keys
 * permissions on.
 */

type LinkedAccount = {
  type?: unknown;
  address?: unknown;
  wallet_client_type?: unknown;
  chain_type?: unknown;
};

let remoteKeys: JWTVerifyGetKey | null = null;

function privyKeys(appId: string): JWTVerifyGetKey {
  // jose caches the key set and refetches on an unknown `kid`, so one instance per process.
  remoteKeys ??= createRemoteJWKSet(new URL(`https://api.privy.io/v1/apps/${appId}/jwks.json`));
  return remoteKeys;
}

function parseLinkedAccounts(claim: unknown): LinkedAccount[] {
  if (Array.isArray(claim)) return claim;
  if (typeof claim !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(claim);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** The embedded wallet address the token vouches for, or null if the token does not verify. */
export async function verifyPrivyIdentityToken(
  token: string,
  options: { appId?: string; keys?: JWTVerifyGetKey } = {}
): Promise<`0x${string}` | null> {
  const appId = options.appId ?? Environment.variables.privyAppId;
  if (!appId || !token) return null;

  try {
    const { payload } = await jwtVerify(token, options.keys ?? privyKeys(appId), {
      algorithms: ['ES256'],
      issuer: 'privy.io',
      audience: appId,
    });

    const wallet = parseLinkedAccounts(payload.linked_accounts).find(
      account =>
        account.type === 'wallet' &&
        account.wallet_client_type === 'privy' &&
        account.chain_type === 'ethereum' &&
        typeof account.address === 'string' &&
        isAddress(account.address, { strict: false })
    );

    return wallet ? getAddress(wallet.address as string) : null;
  } catch {
    return null;
  }
}
