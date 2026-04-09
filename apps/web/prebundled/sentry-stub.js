// Dev-only Sentry stub. The real packages are used in production builds.
const noop = () => {};

export default {};
export const init = noop;
export const captureException = noop;
export const captureMessage = noop;
export const captureRequestError = noop;
export const captureRouterTransitionStart = noop;
export const setUser = noop;
export const setTag = noop;
export const setContext = noop;
export const withScope = noop;
export const startSpan = noop;
export const addBreadcrumb = noop;
export const BrowserClient = class {};
export const Scope = class {};
export const Hub = class {};
export const SentrySpanProcessor = class {
  onStart() {}
  onEnd() {}
  shutdown() { return Promise.resolve(); }
  forceFlush() { return Promise.resolve(); }
};
