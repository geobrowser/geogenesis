/**
 * GEO-3569. "Opening sign-in…" from first paint until Privy's dialog is up.
 *
 * Privy takes seconds to start on a phone, and the page that hydrates first is a feed: a visitor who
 * pressed Sign in on the marketing site started browsing it and then met the dialog as an
 * interruption. The overlay is static markup in the layout, shown by an attribute on <html> that an
 * inline script sets before the app's JavaScript has even downloaded; the sign-in link clears it.
 */

export const SIGN_IN_PENDING_ATTRIBUTE = 'data-sign-in-pending';

/** The overlay goes on its own if nothing clears it, so a failed load cannot leave it up. */
export const SIGN_IN_PENDING_TIMEOUT_MS = 20_000;

/** Inline, so it runs at parse time. Kept to plain ES5 and the one param it checks. */
export const SIGN_IN_PENDING_SCRIPT = `(function(){try{var p=new URLSearchParams(location.search);if(p.get('modal')!=='signin')return;var h=document.documentElement;h.setAttribute('${SIGN_IN_PENDING_ATTRIBUTE}','');setTimeout(function(){h.removeAttribute('${SIGN_IN_PENDING_ATTRIBUTE}')},${SIGN_IN_PENDING_TIMEOUT_MS})}catch(e){}})();`;

export function setSignInPending(pending: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.toggleAttribute(SIGN_IN_PENDING_ATTRIBUTE, pending);
}
