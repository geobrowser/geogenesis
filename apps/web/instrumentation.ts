import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
    // Without it every server read is signed out; say so at boot, not on the first request.
    if (process.env.NODE_ENV === 'production' && !process.env.WALLET_SESSION_SECRET) {
      const { reportMissingWalletSessionSecret } = await import('./core/auth/server/wallet-session');
      reportMissingWalletSessionSecret();
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
