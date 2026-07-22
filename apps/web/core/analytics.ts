'use client';

export type AnalyticsProperties = Record<string, unknown>;

type AnalyticsIdentity = string | number | AnalyticsProperties;

type GeoAnalyticsRuntime = {
  capture?: (eventName: string, properties?: AnalyticsProperties) => void;
  identify?: (user: AnalyticsIdentity, traits?: AnalyticsProperties) => void;
  identifyUser?: (user: AnalyticsIdentity, traits?: AnalyticsProperties) => void;
  pageViewed?: (properties?: AnalyticsProperties) => void;
  voteCast?: (direction: string, properties?: AnalyticsProperties) => void;
  upvoted?: (properties?: AnalyticsProperties) => void;
  downvoted?: (properties?: AnalyticsProperties) => void;
  modeToggled?: (mode: string, properties?: AnalyticsProperties) => void;
  editModeToggled?: (properties?: AnalyticsProperties) => void;
  browseModeToggled?: (properties?: AnalyticsProperties) => void;
  graphEntityViewed?: (properties?: AnalyticsProperties) => void;
  signedUp?: (user: AnalyticsIdentity, properties?: AnalyticsProperties) => void;
  loggedIn?: (user: AnalyticsIdentity, properties?: AnalyticsProperties) => void;
  signedIn?: (user: AnalyticsIdentity, properties?: AnalyticsProperties) => void;
  sessionRestored?: (user: AnalyticsIdentity, properties?: AnalyticsProperties) => void;
  loggedOut?: (properties?: AnalyticsProperties) => void;
  signedOut?: (properties?: AnalyticsProperties) => void;
  identityReset?: (properties?: AnalyticsProperties) => void;
  resetIdentity?: (properties?: AnalyticsProperties) => void;
};

type PendingCall =
  | {
      method: 'capture';
      eventName: string;
      properties: AnalyticsProperties;
    }
  | {
      method: 'pageViewed';
      properties: AnalyticsProperties;
    }
  | {
      method: 'voteCast';
      direction: string;
      properties: AnalyticsProperties;
    }
  | {
      method: 'modeToggled';
      mode: string;
      properties: AnalyticsProperties;
    }
  | {
      method: 'graphEntityViewed';
      properties: AnalyticsProperties;
    }
  | {
      method: 'identifyUser' | 'signedUp' | 'loggedIn' | 'sessionRestored';
      user: AnalyticsIdentity;
      properties: AnalyticsProperties;
    }
  | {
      method: 'loggedOut' | 'identityReset';
      properties: AnalyticsProperties;
    };

type PrivyWallet = {
  address?: string | null;
  walletClientType?: string | null;
  chainType?: string | null;
  connectorType?: string | null;
  imported?: boolean | null;
  delegated?: boolean | null;
};

type PrivyLoginAccount = PrivyWallet & {
  type?: string | null;
};

type PrivyAnalyticsUser = {
  id?: string | null;
  createdAt?: Date | string | null;
  email?: unknown;
  phone?: unknown;
  wallet?: PrivyWallet | null;
  smartWallet?: unknown;
  linkedAccounts?: unknown[] | null;
  mfaMethods?: unknown[] | null;
  hasAcceptedTerms?: boolean | null;
  isGuest?: boolean | null;
};

type PrivyAuthComplete = {
  user: PrivyAnalyticsUser;
  isNewUser: boolean;
  wasAlreadyAuthenticated: boolean;
  loginMethod: string | null;
  loginAccount: PrivyLoginAccount | null;
};

declare global {
  interface Window {
    lytics?: GeoAnalyticsRuntime;
    lyticsConfig?: AnalyticsProperties;
    GeoAnalyticsConfig?: AnalyticsProperties;
    geoAnalytics?: GeoAnalyticsRuntime;
  }
}

const appName = 'genesis';
const analyticsScriptSrc = 'https://geo-any-public.s3.us-east-1.amazonaws.com/ga-3874c92ff7f1.js';
const collectorUrl = 'https://c.geobrowser.io';

let scriptRequested = false;
let lastPageView: { key: string; timestamp: number } | null = null;
const pendingCalls: PendingCall[] = [];

// NEXT_PUBLIC_ prefix is required: this loader runs client-side, and Next only exposes
// NEXT_PUBLIC_* env vars to the browser bundle. Set NEXT_PUBLIC_DISABLE_POSTHOG='1' to keep
// analytics off (e.g. during local dev).
export const isAnalyticsEnabled = process.env.NEXT_PUBLIC_DISABLE_POSTHOG !== '1';

export function initAnalytics() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !isAnalyticsEnabled) {
    return;
  }

  const hostname = window.location.hostname.toLowerCase();
  const shouldUseCollector = shouldUseAnalyticsCollector(hostname);

  window.lyticsConfig = {
    ...window.GeoAnalyticsConfig,
    ...window.lyticsConfig,
    app: appName,
    collectorUrl: shouldUseCollector ? collectorUrl : false,
    collectorMode: isProductionGenesisHost(hostname) ? 'production' : 'shadow',
    environment: analyticsEnvironment(hostname),
    autoPageViews: false,
    autoRouteTracking: false,
  };
  window.GeoAnalyticsConfig = window.lyticsConfig;

  if (analyticsRuntime()?.capture) {
    flushPendingCalls();
    return;
  }

  if (scriptRequested) {
    return;
  }

  scriptRequested = true;

  const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${analyticsScriptSrc}"]`);

  if (existingScript) {
    existingScript.addEventListener('load', flushPendingCalls, { once: true });
    return;
  }

  const script = document.createElement('script');
  script.src = analyticsScriptSrc;
  script.defer = true;
  script.async = true;
  script.dataset.geoAnalyticsLoader = 'true';
  script.onload = flushPendingCalls;
  document.head.appendChild(script);
}

export function capture(eventName: string, properties: AnalyticsProperties = {}) {
  callOrQueue({
    method: 'capture',
    eventName,
    properties: {
      app: appName,
      ...properties,
    },
  });
}

export function pageViewed(properties: AnalyticsProperties = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const pageViewKey = `${document.title}|${window.location.href}`;
  const now = Date.now();

  if (lastPageView?.key === pageViewKey && now - lastPageView.timestamp < 1000) {
    return;
  }

  lastPageView = {
    key: pageViewKey,
    timestamp: now,
  };

  callOrQueue({
    method: 'pageViewed',
    properties: {
      app: appName,
      page_title: document.title,
      page_url: window.location.href,
      page_path: window.location.pathname,
      ...properties,
    },
  });
}

export function identify(user: AnalyticsIdentity, traits: AnalyticsProperties = {}) {
  callOrQueue({
    method: 'identifyUser',
    user,
    properties: cleanProperties(traits),
  });
}

export function voteCast(direction: 'up' | 'down' | 'none', properties: AnalyticsProperties = {}) {
  callOrQueue({
    method: 'voteCast',
    direction,
    properties: cleanProperties(properties),
  });
}

export function upvoted(properties: AnalyticsProperties = {}) {
  voteCast('up', properties);
}

export function downvoted(properties: AnalyticsProperties = {}) {
  voteCast('down', properties);
}

export function modeToggled(mode: 'edit' | 'browse', properties: AnalyticsProperties = {}) {
  callOrQueue({
    method: 'modeToggled',
    mode,
    properties: cleanProperties(properties),
  });
}

export function editModeToggled(properties: AnalyticsProperties = {}) {
  modeToggled('edit', properties);
}

export function browseModeToggled(properties: AnalyticsProperties = {}) {
  modeToggled('browse', properties);
}

export function graphEntityViewed(properties: AnalyticsProperties = {}) {
  callOrQueue({
    method: 'graphEntityViewed',
    properties: cleanProperties(properties),
  });
}

export function personalSpaceViewed(personalSpaceId: string, properties: AnalyticsProperties = {}) {
  graphEntityViewed({
    source: 'browse_sidebar',
    graph_entity_type: 'personal_space',
    space_id: personalSpaceId,
    entity_id: personalSpaceId,
    ...properties,
  });
}

export function reviewChangesOpened(properties: AnalyticsProperties = {}) {
  capture('review_changes_opened', {
    source: 'review_changes',
    ...properties,
  });
}

export function publishedEdit(properties: AnalyticsProperties = {}) {
  capture('published_edit', {
    source: 'publishing',
    ...properties,
  });
}

export function signedUp(user: AnalyticsIdentity, properties: AnalyticsProperties = {}) {
  callOrQueue({
    method: 'signedUp',
    user,
    properties: cleanProperties(properties),
  });
}

export function loggedIn(user: AnalyticsIdentity, properties: AnalyticsProperties = {}) {
  callOrQueue({
    method: 'loggedIn',
    user,
    properties: cleanProperties(properties),
  });
}

export function sessionRestored(user: AnalyticsIdentity, properties: AnalyticsProperties = {}) {
  callOrQueue({
    method: 'sessionRestored',
    user,
    properties: cleanProperties(properties),
  });
}

export function loggedOut(properties: AnalyticsProperties = {}) {
  callOrQueue({
    method: 'loggedOut',
    properties: cleanProperties({
      source: 'privy',
      auth_provider: 'privy',
      ...properties,
    }),
  });
}

export function resetAnalyticsIdentity(properties: AnalyticsProperties = {}) {
  callOrQueue({
    method: 'identityReset',
    properties: cleanProperties({
      source: 'privy',
      auth_provider: 'privy',
      ...properties,
    }),
  });
}

export function identifyPrivyUser(user: PrivyAnalyticsUser, properties: AnalyticsProperties = {}) {
  const identity = privyIdentityProperties(user, properties);

  if (!identity.user_id) {
    return;
  }

  identify(identity);
}

export function restorePrivySession(user: PrivyAnalyticsUser, properties: AnalyticsProperties = {}) {
  const identity = privyIdentityProperties(user, properties);

  if (!identity.user_id) {
    return;
  }

  sessionRestored(
    identity,
    cleanProperties({
      ...identity,
      source: 'privy',
      auth_provider: 'privy',
      auth_flow: 'session_restore',
      is_new_user: false,
      was_already_authenticated: true,
      ...properties,
    })
  );
}

export function trackPrivyAuth(params: PrivyAuthComplete, properties: AnalyticsProperties = {}) {
  const identity = privyIdentityProperties(params.user);

  if (!identity.user_id) {
    return;
  }

  const loginAccount = params.loginAccount;
  const authFlow = properties.auth_flow;
  const isManualLoginFlow = authFlow === 'manual_login';
  const authProperties = cleanProperties({
    ...identity,
    ...(params.isNewUser ? privySignupProperties(params.user) : {}),
    source: 'privy',
    auth_provider: 'privy',
    auth_flow: isManualLoginFlow ? 'manual_login' : 'session_restore',
    is_new_user: params.isNewUser,
    was_already_authenticated: params.wasAlreadyAuthenticated,
    login_method: params.loginMethod,
    login_account_type: loginAccount?.type,
    login_wallet_client_type: loginAccount?.walletClientType,
    login_wallet_chain_type: loginAccount?.chainType,
    login_wallet_connector_type: loginAccount?.connectorType,
    ...properties,
  });

  if (params.wasAlreadyAuthenticated && !isManualLoginFlow) {
    sessionRestored(identity, authProperties);
  } else if (params.isNewUser) {
    signedUp(identity, authProperties);
  } else {
    loggedIn(identity, authProperties);
  }
}

function callOrQueue(call: PendingCall) {
  if (typeof window === 'undefined' || !isAnalyticsEnabled) {
    return;
  }

  initAnalytics();

  if (invokeRuntime(call)) {
    return;
  }

  pendingCalls.push(call);
}

function flushPendingCalls() {
  while (pendingCalls.length > 0) {
    const call = pendingCalls[0];

    if (!call) {
      return;
    }

    if (!invokeRuntime(call)) {
      return;
    }

    pendingCalls.shift();
  }
}

function invokeRuntime(call: PendingCall) {
  const analytics = analyticsRuntime();

  if (!analytics) {
    return false;
  }

  if (call.method === 'capture' && analytics.capture) {
    analytics.capture(call.eventName, call.properties);
    return true;
  }

  if (call.method === 'pageViewed' && analytics.pageViewed) {
    analytics.pageViewed(call.properties);
    return true;
  }

  if (call.method === 'voteCast') {
    if (call.direction === 'up' && analytics.upvoted) {
      analytics.upvoted(call.properties);
      return true;
    }

    if (call.direction === 'down' && analytics.downvoted) {
      analytics.downvoted(call.properties);
      return true;
    }

    if (analytics.voteCast) {
      analytics.voteCast(call.direction, call.properties);
      return true;
    }

    if (analytics.capture) {
      analytics.capture('vote_cast', {
        source: 'voting',
        vote_direction: call.direction,
        ...call.properties,
      });
      return true;
    }
  }

  if (call.method === 'modeToggled') {
    if (call.mode === 'edit' && analytics.editModeToggled) {
      analytics.editModeToggled(call.properties);
      return true;
    }

    if (call.mode === 'browse' && analytics.browseModeToggled) {
      analytics.browseModeToggled(call.properties);
      return true;
    }

    if (analytics.modeToggled) {
      analytics.modeToggled(call.mode, call.properties);
      return true;
    }

    if (analytics.capture) {
      analytics.capture('mode_toggled', {
        source: 'mode_toggle',
        mode: call.mode,
        ...call.properties,
      });
      return true;
    }
  }

  if (call.method === 'graphEntityViewed') {
    if (analytics.graphEntityViewed) {
      analytics.graphEntityViewed(call.properties);
      return true;
    }

    if (analytics.capture) {
      analytics.capture('graph_entity_viewed', {
        source: 'graph',
        ...call.properties,
      });
      return true;
    }
  }

  if (call.method === 'identifyUser') {
    const identifyUser = analytics.identifyUser ?? analytics.identify;

    if (identifyUser) {
      identifyUser(call.user, call.properties);
      return true;
    }
  }

  if (call.method === 'signedUp' && analytics.signedUp) {
    analytics.signedUp(call.user, call.properties);
    return true;
  }

  if (call.method === 'loggedIn') {
    const loggedIn = analytics.loggedIn ?? analytics.signedIn;

    if (loggedIn) {
      loggedIn(call.user, call.properties);
      return true;
    }
  }

  if (call.method === 'sessionRestored' && analytics.sessionRestored) {
    analytics.sessionRestored(call.user, call.properties);
    return true;
  }

  if (call.method === 'loggedOut') {
    const loggedOut = analytics.loggedOut ?? analytics.signedOut;

    if (loggedOut) {
      loggedOut(call.properties);
      return true;
    }
  }

  if (call.method === 'identityReset') {
    const identityReset = analytics.identityReset ?? analytics.resetIdentity;

    if (identityReset) {
      identityReset(call.properties);
      return true;
    }
  }

  return false;
}

function analyticsRuntime() {
  return window.lytics || window.geoAnalytics;
}

function privyIdentityProperties(user: PrivyAnalyticsUser, properties: AnalyticsProperties = {}) {
  const wallet = user.wallet ?? null;

  return cleanProperties({
    user_id: user.id,
    privy_user_id: user.id,
    auth_provider: 'privy',
    privy_user_created_at: formatDate(user.createdAt),
    has_privy_email: Boolean(user.email),
    has_privy_phone: Boolean(user.phone),
    has_privy_wallet: Boolean(user.wallet),
    has_privy_smart_wallet: Boolean(user.smartWallet),
    privy_linked_account_count: Array.isArray(user.linkedAccounts) ? user.linkedAccounts.length : undefined,
    privy_mfa_method_count: Array.isArray(user.mfaMethods) ? user.mfaMethods.length : undefined,
    privy_has_accepted_terms: user.hasAcceptedTerms,
    privy_is_guest: user.isGuest,
    privy_wallet_client_type: wallet?.walletClientType,
    privy_wallet_chain_type: wallet?.chainType,
    privy_wallet_connector_type: wallet?.connectorType,
    privy_wallet_imported: wallet?.imported,
    privy_wallet_delegated: wallet?.delegated,
    ...properties,
  });
}

function privySignupProperties(user: PrivyAnalyticsUser): AnalyticsProperties {
  const email = privyEmail(user);

  return email ? { email } : {};
}

function privyEmail(user: PrivyAnalyticsUser) {
  return emailFromUnknown(user.email) ?? linkedAccountEmail(user.linkedAccounts);
}

function linkedAccountEmail(accounts: unknown[] | null | undefined) {
  if (!Array.isArray(accounts)) {
    return undefined;
  }

  for (const account of accounts) {
    const email = emailFromUnknown(account);

    if (email) {
      return email;
    }
  }

  return undefined;
}

function emailFromUnknown(value: unknown) {
  if (typeof value === 'string') {
    return normalizeEmail(value);
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of ['address', 'email', 'emailAddress']) {
    const email = normalizeEmail(value[key]);

    if (email) {
      return email;
    }
  }

  return undefined;
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const email = value.trim().toLowerCase();

  return email.includes('@') ? email : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanProperties(properties: AnalyticsProperties) {
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined));
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

export function analyticsEnvironment(hostname: string) {
  if (isProductionGenesisHost(hostname)) {
    return 'production';
  }

  if (process.env.NODE_ENV === 'production') {
    return 'preview';
  }

  return 'development';
}

function isGeoBrowserHost(hostname: string) {
  return hostname === 'geobrowser.io' || hostname.endsWith('.geobrowser.io');
}

export function shouldUseAnalyticsCollector(hostname: string) {
  return isGeoBrowserHost(hostname);
}

export function isProductionGenesisHost(hostname: string) {
  return (
    hostname === 'geobrowser.io' ||
    hostname === 'www.geobrowser.io' ||
    hostname === 'app.geobrowser.io' ||
    hostname === 'genesis.geobrowser.io' ||
    hostname === 'geogenesis.geobrowser.io'
  );
}
