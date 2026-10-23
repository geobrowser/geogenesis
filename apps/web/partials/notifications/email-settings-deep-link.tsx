'use client';

import * as React from 'react';

import { useDeepLinkEffect, useDeepLinkParams } from '~/core/deep-links/use-deep-link';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { geoNotificationsApiUrl } from '~/core/notifications/api';
import { EMAIL_SETTINGS_MODAL, toEmailSettings } from '~/core/notifications/email-settings-link';
import { usePrivy } from '~/core/wallet/auth-hooks';

import { EmailSettingsDialog } from './email-settings-dialog';

/**
 * Opens email settings for someone who arrived on `?modal=email-settings` (GEO-3392), signing them in
 * first if they aren't.
 *
 * The wait for sign-in is held here, at the app-level mount, rather than in the sign-in's completion
 * callback: a new account goes through onboarding and comes back by navigating, so the sign-in returns
 * to the link itself, which opens the dialog again now that they are signed in.
 */
export function EmailSettingsDeepLink() {
  const { ready, authenticated } = usePrivy();
  const link = useDeepLinkParams(EMAIL_SETTINGS_MODAL);
  const [open, setOpen] = React.useState(false);
  const [awaitingSignIn, setAwaitingSignIn] = React.useState(false);
  const [via, setVia] = React.useState<string | null>(null);

  const openSignIn = usePrivySignIn(undefined, {
    redirectTo: toEmailSettings(link.cleanUrl, link.via ?? undefined),
    analytics: {
      component: 'sign_in_deep_link',
      auth_trigger: 'deep_link',
      auth_control: 'open_email_settings',
      link_source: link.via ?? undefined,
    },
  });

  useDeepLinkEffect({
    ...link,
    // Held until Privy has restored any session: acting early would ask a signed-in person to sign in.
    enabled: ready && geoNotificationsApiUrl() !== null,
    run: () => {
      setVia(link.via);
      if (authenticated) {
        setOpen(true);
        return;
      }
      setAwaitingSignIn(true);
      openSignIn(undefined, { onCancel: () => setAwaitingSignIn(false) });
    },
  });

  React.useEffect(() => {
    if (!awaitingSignIn || !authenticated) return;
    setAwaitingSignIn(false);
    setOpen(true);
  }, [authenticated, awaitingSignIn]);

  // Signing out with the dialog open leaves nothing to set, and it should not come back on the next sign-in.
  React.useEffect(() => {
    if (ready && !authenticated) setOpen(false);
  }, [authenticated, ready]);

  if (!open || !authenticated) return null;

  return <EmailSettingsDialog entry="link" via={via} onClose={() => setOpen(false)} />;
}
