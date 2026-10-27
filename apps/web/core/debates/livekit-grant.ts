type LiveKitVideoGrant = {
  canPublish?: boolean;
  canPublishSources?: unknown;
};

function readVideoGrant(token: string): LiveKitVideoGrant | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    // Base64url, which `atob` does not accept: it rejects `-`/`_` and wants the padding back.
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const claims = JSON.parse(atob(padded)) as { video?: LiveKitVideoGrant };
    return claims.video ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether this token allows publishing a camera. A missing source list allows everything;
 * a present one is exhaustive.
 */
export function tokenAllowsCamera(token: string): boolean {
  const grant = readVideoGrant(token);
  if (!grant) return false;
  if (grant.canPublish === false) return false;
  if (!Array.isArray(grant.canPublishSources)) return true;
  return grant.canPublishSources.includes('camera');
}
