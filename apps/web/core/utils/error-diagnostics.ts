/**
 * Walk an Error's cause chain into a single multi-line string so the global
 * toast surfaces the underlying reason — not just the wrapper message.
 *
 * For example, a `TransactionWriteFailedError("Publish failed", { cause: viemError })`
 * unwraps as:
 *   Publish failed
 *   Caused by: ContractFunctionExecutionError: ...
 *   Caused by: NotAMember(...)
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const parts: string[] = [error.message];
    let cause: unknown = error.cause;
    let depth = 0;
    while (cause instanceof Error && depth < 10) {
      parts.push(`Caused by: ${cause.message}`);
      cause = cause.cause;
      depth += 1;
    }
    return parts.join('\n');
  }
  return String(error ?? 'Unknown error');
}

// Next.js/webpack code-split failures show up under a few different messages
// depending on browser. `error loading dynamically imported module` is the
// native ESM variant; the rest are webpack's.
const CHUNK_ERROR_RE =
  /ChunkLoadError|Loading chunk|Failed to load chunk|error loading dynamically imported module|Importing a module script failed/i;

/**
 * A code-split chunk failed to download. The loaded app is stale (a deploy
 * usually landed while the tab was open) or the network dropped the request.
 * Retrying the same dynamic import won't help — only a full reload fetches the
 * new chunk manifest. Walks the cause chain since the chunk error is often
 * wrapped (e.g. inside a `TransactionWriteFailedError`).
 */
export function isChunkLoadError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 10; depth++) {
    if (current.name === 'ChunkLoadError' || CHUNK_ERROR_RE.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

/**
 * Whether an error (or anything in its cause chain) is a wallet user-rejection.
 * Callers reset quietly instead of raising the error modal — a deliberate cancel
 * isn't a failure to surface or investigate. Walks the cause chain since the
 * original error is nested via `{ cause }`.
 */
export function isUserRejection(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 10; depth++) {
    if (current.message.includes('User rejected the request') || current.name === 'UserRejectedRequestError') {
      return true;
    }
    current = current.cause;
  }
  return false;
}

export const RELOAD_REQUIRED_MESSAGE =
  'A new version of Geo was released or the connection dropped while loading. Please reload the page and try again.';

/**
 * Turn a caught error into the message + optional retry action for the global
 * toast. Chunk-load failures get a reload prompt instead of the wrapper's
 * label (which would otherwise blame e.g. IPFS for what is really a stale
 * bundle); everything else falls through to the unwrapped cause chain.
 */
export function toUserFacingError(error: unknown, prefix = ''): { message: string; retry?: () => void } {
  if (isChunkLoadError(error)) {
    return {
      message: RELOAD_REQUIRED_MESSAGE,
      retry: typeof window !== 'undefined' ? () => window.location.reload() : undefined,
    };
  }
  return { message: `${prefix}${describeError(error)}` };
}

/**
 * Diagnostics gathered when the user copies an error from the global toast.
 * Designed to be safe to share with the dev team — no wallet keys or
 * private data, just enough environmental context to reproduce.
 */
export type ErrorDiagnostics = {
  loggedIn: boolean;
  editMode: boolean;
  walletAddress?: string;
  personalSpaceId?: string;
  url?: string;
  userAgent?: string;
  os?: string;
  browser?: string;
  viewport?: string;
  timestamp: string;
};

/** Best-effort browser/OS sniff from navigator.userAgent. */
function parseUserAgent(ua: string): { browser: string; os: string } {
  let browser = 'Unknown';
  let os = 'Unknown';

  // Order matters: more specific tokens first (e.g. Edg before Chrome).
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/')) browser = 'Safari';

  if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  return { browser, os };
}

export function collectClientDiagnostics(input: {
  loggedIn: boolean;
  editMode: boolean;
  walletAddress?: string | null;
  personalSpaceId?: string | null;
}): ErrorDiagnostics {
  const out: ErrorDiagnostics = {
    loggedIn: input.loggedIn,
    editMode: input.editMode,
    walletAddress: input.walletAddress ?? undefined,
    personalSpaceId: input.personalSpaceId ?? undefined,
    timestamp: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    out.url = window.location.href;
    if (window.innerWidth && window.innerHeight) {
      out.viewport = `${window.innerWidth}x${window.innerHeight}`;
    }
  }

  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    out.userAgent = navigator.userAgent;
    const { browser, os } = parseUserAgent(navigator.userAgent);
    out.browser = browser;
    out.os = os;
  }

  return out;
}

/**
 * Format the error message + diagnostics into a single block users can paste
 * directly into Discord / Linear / Slack without further editing.
 */
export function formatErrorReport(error: string, diagnostics: ErrorDiagnostics): string {
  const lines: string[] = [];

  lines.push('Error message:');
  lines.push(error);
  lines.push('');
  lines.push('Diagnostics:');
  lines.push(`- Browser: ${diagnostics.browser ?? 'Unknown'}`);
  lines.push(`- OS: ${diagnostics.os ?? 'Unknown'}`);
  lines.push(`- Logged in: ${diagnostics.loggedIn ? 'yes' : 'no'}`);
  lines.push(`- Edit mode: ${diagnostics.editMode ? 'yes' : 'no'}`);
  if (diagnostics.walletAddress) lines.push(`- Wallet: ${diagnostics.walletAddress}`);
  if (diagnostics.personalSpaceId) lines.push(`- Personal space: ${diagnostics.personalSpaceId}`);
  if (diagnostics.url) lines.push(`- URL: ${diagnostics.url}`);
  if (diagnostics.viewport) lines.push(`- Viewport: ${diagnostics.viewport}`);
  if (diagnostics.userAgent) lines.push(`- User agent: ${diagnostics.userAgent}`);
  lines.push(`- Timestamp: ${diagnostics.timestamp}`);

  return lines.join('\n');
}
