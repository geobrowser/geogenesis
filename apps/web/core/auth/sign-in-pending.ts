/**
 * GEO-3569. An "Opening sign-in…" overlay from first paint until Privy's dialog is up. Static markup
 * in the layout, shown by an `<html>` attribute an inline script sets before the app loads.
 */
import { PRIVY_ACCESS_TOKEN_KEY, PRIVY_REFRESH_TOKEN_KEY, PRIVY_SESSION_COOKIE } from '~/core/wallet/privy-session';

export const SIGN_IN_PENDING_ATTRIBUTE = 'data-sign-in-pending';

/** The overlay goes on its own if nothing clears it, so a failed load cannot leave it up. */
export const SIGN_IN_PENDING_TIMEOUT_MS = 20_000;

/**
 * `hasPersistedPrivySession` from `privy-session.ts`, in ES5: someone already signed in is not
 * shown the overlay while Privy restores their session. A test keeps the two in step.
 */
const HAS_SESSION = `function(){function s(k){try{var v=JSON.parse(localStorage.getItem(k));return typeof v==='string'&&v.length>0?v:null}catch(e){return null}}if(document.cookie.split(';').some(function(c){c=c.trim();var i=c.indexOf('=');return i>0&&c.slice(0,i)==='${PRIVY_SESSION_COOKIE}'&&c.length>i+1}))return true;var r=s('${PRIVY_REFRESH_TOKEN_KEY}');if(r!==null&&r!=='deprecated')return true;if(s('${PRIVY_ACCESS_TOKEN_KEY}')!==null)return true;return ['privy_oauth_code','privy_oauth_state','privy_oauth_provider'].some(function(k){return p.has(k)})}`;

/** Inline, so it runs at parse time. Kept to plain ES5. */
export const SIGN_IN_PENDING_SCRIPT = `(function(){try{var p=new URLSearchParams(location.search);if(p.get('modal')!=='signin')return;if((${HAS_SESSION})())return;var h=document.documentElement;h.setAttribute('${SIGN_IN_PENDING_ATTRIBUTE}','');setTimeout(function(){h.removeAttribute('${SIGN_IN_PENDING_ATTRIBUTE}')},${SIGN_IN_PENDING_TIMEOUT_MS})}catch(e){}})();`;

export function setSignInPending(pending: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.toggleAttribute(SIGN_IN_PENDING_ATTRIBUTE, pending);
}
