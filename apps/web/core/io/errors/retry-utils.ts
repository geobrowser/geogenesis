export type RetryCategory =
  | 'http_503_api_overloaded'
  | 'http_503_ingress_unavailable'
  | 'http_5xx_other'
  | 'http_429'
  | 'http_408'
  | 'http_4xx_non_retryable'
  | 'transport_timeout'
  | 'transport_dns'
  | 'transport_connection_reset'
  | 'transport_connection_refused'
  | 'transport_unknown';

type ErrorRecord = Record<string, unknown>;

export type TransportFailure = {
  category: RetryCategory;
  name: string;
  message: string;
  code?: string;
  errno?: string;
  syscall?: string;
  causeName?: string;
  causeMessage?: string;
  causeCode?: string;
};

function asRecord(value: unknown): ErrorRecord | null {
  return value !== null && typeof value === 'object' ? (value as ErrorRecord) : null;
}

export function classifyTransportFailure(error: unknown): TransportFailure {
  const err = asRecord(error);
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : typeof err?.name === 'string' ? err.name : 'Error';
  const code = typeof err?.code === 'string' ? err.code : undefined;
  const errno = typeof err?.errno === 'string' ? err.errno : undefined;
  const syscall = typeof err?.syscall === 'string' ? err.syscall : undefined;
  const cause = asRecord(err?.cause);
  const causeName = typeof cause?.name === 'string' ? cause.name : undefined;
  const causeMessage = typeof cause?.message === 'string' ? cause.message : undefined;
  const causeCode = typeof cause?.code === 'string' ? cause.code : undefined;
  const haystack = `${message} ${code ?? ''} ${errno ?? ''} ${causeMessage ?? ''} ${causeCode ?? ''}`.toLowerCase();

  if (
    haystack.includes('timed out') ||
    haystack.includes('timeout') ||
    haystack.includes('etimedout') ||
    haystack.includes('und_err_connect_timeout')
  ) {
    return { category: 'transport_timeout', name, message, code, errno, syscall, causeName, causeMessage, causeCode };
  }

  if (haystack.includes('enotfound') || haystack.includes('eai_again') || haystack.includes('dns')) {
    return { category: 'transport_dns', name, message, code, errno, syscall, causeName, causeMessage, causeCode };
  }

  if (haystack.includes('econnreset') || haystack.includes('connection reset')) {
    return {
      category: 'transport_connection_reset',
      name,
      message,
      code,
      errno,
      syscall,
      causeName,
      causeMessage,
      causeCode,
    };
  }

  if (haystack.includes('econnrefused') || haystack.includes('connection refused')) {
    return {
      category: 'transport_connection_refused',
      name,
      message,
      code,
      errno,
      syscall,
      causeName,
      causeMessage,
      causeCode,
    };
  }

  return { category: 'transport_unknown', name, message, code, errno, syscall, causeName, causeMessage, causeCode };
}

export function isRetryableCategory(category: RetryCategory | undefined): boolean {
  if (!category) {
    return false;
  }

  return (
    category === 'http_503_api_overloaded' ||
    category === 'http_503_ingress_unavailable' ||
    category === 'http_5xx_other' ||
    category === 'http_429' ||
    category === 'http_408' ||
    category === 'transport_timeout' ||
    category === 'transport_connection_reset' ||
    category === 'transport_connection_refused' ||
    category === 'transport_dns'
  );
}

export function parseRetryAfterMs(value: string | null, maxMs = 30_000): number | undefined {
  if (!value) {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (/^\d+$/.test(trimmedValue)) {
    return clampRetryAfterMs(Number.parseInt(trimmedValue, 10) * 1_000, maxMs);
  }

  const parsedDate = Date.parse(trimmedValue);
  if (Number.isNaN(parsedDate)) {
    return undefined;
  }

  return clampRetryAfterMs(Math.max(0, parsedDate - Date.now()), maxMs);
}

function clampRetryAfterMs(value: number, maxMs: number): number {
  return Math.min(Math.max(0, value), maxMs);
}

export function withRetryAfterJitter(value: number, jitterFactor = 0.2): number {
  const spread = Math.max(1, Math.floor(value * jitterFactor));
  const min = Math.max(0, value - spread);
  const max = value + spread;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function isIngressUnavailableHtml(contentType: string | null, body: string): boolean {
  const normalizedContentType = (contentType ?? '').toLowerCase();
  const normalizedBody = body.toLowerCase();

  return (
    normalizedContentType.includes('text/html') &&
    normalizedBody.includes('503 service temporarily unavailable') &&
    normalizedBody.includes('nginx')
  );
}
