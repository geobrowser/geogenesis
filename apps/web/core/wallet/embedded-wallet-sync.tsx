'use client';

import { useEnsureEmbeddedWallet } from '@geogenesis/auth';

/**
 * Mounted for the life of the app, beside the other identity side-effects in `providers.tsx`.
 *
 * Renders nothing; it exists so that becoming authenticated always leads to an embedded wallet in
 * wagmi's context, whichever way the session started. The headless email login does not create one
 * on its own, and the first version of this lived inside the sign-up card — which unmounts itself
 * the moment `authenticated` turns true, so it was destroyed in the very render where its work
 * became possible.
 */
export function EmbeddedWalletSync() {
  useEnsureEmbeddedWallet();
  return null;
}
