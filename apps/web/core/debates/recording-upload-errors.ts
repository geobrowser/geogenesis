import { GeoChatRequestError } from './api';

/**
 * A failure in the browser's own part of a recording upload: the PUT to object storage, or a part
 * the server never signed. It carries a stable `code` so analytics can count it, which a bare
 * `Error` cannot — 181 of the first 229 retry events said only `error_name: 'Error'` (GEO-3051).
 *
 * The message stays what it was, since the upload banner shows it to the person waiting.
 */
export class RecordingUploadError extends Error {
  code: string;
  httpStatus: number | null;

  constructor(message: string, code: string, httpStatus: number | null = null) {
    super(message);
    this.name = 'RecordingUploadError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** Object storage answered, and not with success. */
export function recordingStorageHttpError(message: string, status: number) {
  return new RecordingUploadError(message, `http_${status}`, status);
}

/**
 * The stable codes a client-side upload failure is filed under, for when geo-chat did not supply
 * one. A failure from geo-chat keeps geo-chat's own code (`recording_not_ready`, ...).
 */
export type RecordingUploadClientErrorCode =
  | `http_${number}`
  | 'offline'
  | 'network'
  | 'fetch_failed'
  | 'storage_quota'
  | 'indexeddb'
  | 'blob_unreadable'
  | 'aborted'
  | 'timeout'
  | 'auth_required'
  | 'part_url_missing'
  | 'unknown';

export type RecordingUploadErrorProperties = {
  error_code: string;
  http_status: number | null;
  error_name: string;
  error_message: string | null;
};

// IndexedDB failures arrive as DOMExceptions, or as Dexie's wrappers of them; both carry the name.
const indexedDbErrorNames = new Set([
  'DatabaseClosedError',
  'OpenFailedError',
  'InvalidStateError',
  'TransactionInactiveError',
  'UnknownError',
  'VersionError',
  'DataError',
  'DataCloneError',
  'ReadOnlyError',
  'MissingAPIError',
  'InvalidAccessError',
  'InvalidTableError',
  'SchemaError',
  'ConstraintError',
  'NoSuchDatabaseError',
  'DatabaseClosed',
  'PrematureCommitError',
]);

// A Blob whose backing data is gone — Safari can lose the file behind a blob kept in IndexedDB.
const blobUnreadableErrorNames = new Set(['NotReadableError', 'NotFoundError']);

/**
 * One classifier for every recording upload failure, so the retry and the terminal event file the
 * same failure under the same code.
 *
 * `error_message` is the error's own words with anything that could name a file, carry a signed
 * URL or a token taken out, and is withheld entirely for geo-chat errors: those are prose for a
 * person, can name one, and already have a code.
 */
export function recordingUploadErrorProperties(
  error: unknown,
  { online }: { online: boolean }
): RecordingUploadErrorProperties {
  if (error instanceof GeoChatRequestError) {
    return {
      error_code: error.code ?? `http_${error.status}`,
      http_status: error.status,
      error_name: 'GeoChatRequestError',
      error_message: null,
    };
  }
  const errorName = errorNameOf(error);
  const message = error instanceof Error ? error.message : '';
  return {
    error_code: classifyRecordingUploadError(error, online),
    http_status: error instanceof RecordingUploadError ? error.httpStatus : null,
    error_name: errorName,
    error_message: redactRecordingUploadErrorMessage(message),
  };
}

export function classifyRecordingUploadError(error: unknown, online: boolean): string {
  if (error instanceof GeoChatRequestError) return error.code ?? `http_${error.status}`;
  if (error instanceof RecordingUploadError) {
    // An XHR that never reached the server while the browser also says it is offline is the
    // connection, not the upload.
    return error.code === 'network' && !online ? 'offline' : error.code;
  }

  const name = errorNameOf(error);
  const inner = innerErrorName(error);
  const message = error instanceof Error ? error.message : '';

  if (name === 'QuotaExceededError' || inner === 'QuotaExceededError') return 'storage_quota';
  if (name === 'TimeoutError' || /timed out/i.test(message)) return 'timeout';
  if (blobUnreadableErrorNames.has(name)) return 'blob_unreadable';
  if (
    indexedDbErrorNames.has(name) ||
    (inner !== null && indexedDbErrorNames.has(inner)) ||
    /indexed ?db|indexed database/i.test(message)
  ) {
    return 'indexeddb';
  }
  if (name === 'AbortError') return 'aborted';
  if (/^sign in to use debates/i.test(message) || /session changed while authentication/i.test(message)) {
    return 'auth_required';
  }
  if (!online) return 'offline';
  // `fetch` rejects with a TypeError, and only that, when the request never got a response:
  // "Failed to fetch" (Chrome), "Load failed" (Safari), "NetworkError when attempting..." (Firefox).
  if (name === 'TypeError') return 'fetch_failed';
  return 'unknown';
}

const maxErrorMessageLength = 200;

/**
 * An error message with nothing in it that could identify a file or authorize a request: URLs
 * (signed ones carry credentials in the query), object keys and paths, filenames with a media
 * extension, query strings, and long opaque tokens. Capped, and null when nothing is left.
 */
export function redactRecordingUploadErrorMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  const redacted = message
    // blob:/data: URLs (a blob URL wraps an origin, so these go first), then any scheme://...
    .replace(/\b(?:blob|data):[^\s"'<>()]+/gi, '<url>')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>()]+/gi, '<url>')
    // Bare query strings.
    .replace(/[?&][^\s"'<>=&]+=[^\s"'<>]*/g, '<query>')
    // Anything with a path separator: object keys, filesystem paths.
    .replace(/[^\s"'<>()]*[/\\][^\s"'<>()]*/g, '<path>')
    // Filenames with an extension (recordings are `<key>.local.webm` and the like).
    .replace(/[^\s"'<>()]+\.[a-z0-9]{2,5}\b/gi, match => (/^\d+(\.\d+)*$/.test(match) ? match : '<file>'))
    // Long hex / base64-ish runs: tokens, signatures, ids.
    .replace(/[A-Za-z0-9+_=-]{32,}/g, '<token>')
    .replace(/\s+/g, ' ')
    .trim();
  return redacted ? redacted.slice(0, maxErrorMessageLength) : null;
}

function errorNameOf(error: unknown): string {
  if (error instanceof Error) return error.name;
  if (typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string') {
    return error.name;
  }
  return typeof error;
}

/** Dexie keeps the DOMException it wrapped on `inner`. */
function innerErrorName(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('inner' in error)) return null;
  const inner = (error as { inner?: unknown }).inner;
  return typeof inner === 'object' && inner !== null && 'name' in inner && typeof inner.name === 'string'
    ? inner.name
    : null;
}
