import { SIGN_IN_MODAL } from '~/core/auth/sign-in-deep-link';
import { requestsModal } from '~/core/deep-links/modal-deep-link';

import { pendingCodeElsewhere } from './code-step';

/** This page opens sign-in by itself (the sign-in link, or a code step to pick up), so Privy loads at once. */
export function signInExpectedOnLoad(): boolean {
  if (typeof window === 'undefined') return false;
  return requestsModal(new URLSearchParams(window.location.search), SIGN_IN_MODAL) || pendingCodeElsewhere() !== null;
}
