/** User-agent markers from Privy 3.32.2's in-app browser check, where it refuses Google sign-in. */
const IN_APP_BROWSER_MARKERS = ['fbav', 'fban', 'instagram', 'snapchat', 'linkedinapp'];

type WebViewWindow = Window & {
  ReactNativeWebView?: unknown;
  webkit?: { messageHandlers?: { ReactNativeWebView?: unknown } };
};

/** Whether this is an in-app browser (Instagram, Facebook, LinkedIn, …), using Privy's own check. */
export function isInAppBrowser() {
  if (typeof window === 'undefined') return false;
  const webView = window as WebViewWindow;
  if (webView.ReactNativeWebView || webView.webkit?.messageHandlers?.ReactNativeWebView) return true;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return IN_APP_BROWSER_MARKERS.some(marker => userAgent.includes(marker));
}
