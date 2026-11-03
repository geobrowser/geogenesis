import { SIGN_IN_MODAL } from '~/core/auth/sign-in-deep-link';
import { requestsModal } from '~/core/deep-links/modal-deep-link';

import { reloadedCodeStep } from './code-step';

/**
 * Whether this page will open sign-in on its own as soon as it can: the sign-in deep link
 * (GEO-3569), or a tab reloaded at the code step (GEO-3573). Either way Privy is needed at once,
 * and loading it only when the dialog is asked for put its chunk and start-up after hydration, so
 * the dialog arrived seconds after the page, over a feed the visitor had started on.
 */
export function signInExpectedOnLoad(): boolean {
  if (typeof window === 'undefined') return false;
  return requestsModal(new URLSearchParams(window.location.search), SIGN_IN_MODAL) || reloadedCodeStep() !== null;
}
