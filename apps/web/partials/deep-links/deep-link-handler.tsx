'use client';

import { useSignInDeepLink } from '~/core/auth/use-sign-in-deep-link';
import { useDebatesPanelDeepLink } from '~/core/debates/use-debates-panel-deep-link';

/**
 * Every deep link, at one mount point. Adding a link is a hook and a value in `DEEP_LINK_MODALS`,
 * rather than another dynamic import and another Suspense boundary in `app/entry.tsx`.
 *
 * The hooks are called unconditionally and each no-ops unless the URL names its own `modal` value,
 * so nothing here dispatches and no link can clear another's trigger.
 */
export function DeepLinkHandler() {
  useSignInDeepLink();
  useDebatesPanelDeepLink();

  return null;
}
