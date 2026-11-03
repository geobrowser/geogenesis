/**
 * GEO-3569. An "Opening sign-in…" overlay from first paint until Privy's dialog is up. Static markup
 * in the layout, shown by an `<html>` attribute an inline script sets before the app loads.
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
