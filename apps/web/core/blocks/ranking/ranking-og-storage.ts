import { createHash, createHmac } from 'node:crypto';

export const RANKING_OG_IMAGE_CONTENT_TYPE = 'image/png';

export const RANKING_OG_VARIANTS = ['landscape', 'story'] as const;

export type RankingOgVariant = (typeof RANKING_OG_VARIANTS)[number];

export const RANKING_OG_VARIANT_SIZES: Record<RankingOgVariant, { width: number; height: number }> = {
  landscape: { width: 2400, height: 1260 },
  story: { width: 1080, height: 1920 },
};

export type RankingOgStorageConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

export type RankingOgObjectKeyInput = {
  rankEntityId: string;
  version: string;
  variant: RankingOgVariant;
};

export type RankingOgPutObjectInput = RankingOgObjectKeyInput & {
  body: Uint8Array;
};

export class RankingOgStorageConfigError extends Error {
  constructor(message = 'Ranking OG R2 storage is not configured') {
    super(message);
    this.name = 'RankingOgStorageConfigError';
  }
}

export function isRankingOgVariant(value: unknown): value is RankingOgVariant {
  return typeof value === 'string' && RANKING_OG_VARIANTS.includes(value as RankingOgVariant);
}

export function normalizeRankingOgKeyPart(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  return normalized || 'unknown';
}

export function buildRankingOgObjectKey({ rankEntityId, version, variant }: RankingOgObjectKeyInput): string {
  return [
    'og',
    'rankings',
    normalizeRankingOgKeyPart(rankEntityId),
    normalizeRankingOgKeyPart(version),
    `${variant}.png`,
  ].join('/');
}

export function buildRankingOgPublicUrl(publicBaseUrl: string, key: string): string {
  const base = publicBaseUrl.replace(/\/+$/, '');
  const path = key
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/');
  return `${base}/${path}`;
}

export function getRankingOgPublicBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.RANKING_OG_PUBLIC_BASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function getRankingOgStorageConfig(env: NodeJS.ProcessEnv = process.env): RankingOgStorageConfig {
  const config = {
    accountId: env.RANKING_OG_R2_ACCOUNT_ID?.trim() ?? '',
    accessKeyId: env.RANKING_OG_R2_ACCESS_KEY_ID?.trim() ?? '',
    secretAccessKey: env.RANKING_OG_R2_SECRET_ACCESS_KEY?.trim() ?? '',
    bucket: env.RANKING_OG_R2_BUCKET?.trim() ?? '',
    publicBaseUrl: env.RANKING_OG_PUBLIC_BASE_URL?.trim() ?? '',
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new RankingOgStorageConfigError(`Missing ranking OG R2 env: ${missing.join(', ')}`);
  }

  try {
    new URL(config.publicBaseUrl);
  } catch {
    throw new RankingOgStorageConfigError('RANKING_OG_PUBLIC_BASE_URL must be a valid URL');
  }

  return config;
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: string | Uint8Array, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key: string | Uint8Array, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

function amzDate(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    longDate: iso,
    shortDate: iso.slice(0, 8),
  };
}

function encodeS3Path(path: string): string {
  return path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function signR2Request({
  method,
  url,
  body = new Uint8Array(),
  config,
  date = new Date(),
}: {
  method: 'HEAD' | 'PUT';
  url: URL;
  body?: Uint8Array;
  config: RankingOgStorageConfig;
  date?: Date;
}): Headers {
  const { longDate, shortDate } = amzDate(date);
  const payloadHash = sha256Hex(body);
  const canonicalHeaders = [
    ['host', url.host],
    ['x-amz-content-sha256', payloadHash],
    ['x-amz-date', longDate],
  ] as const;
  const signedHeaders = canonicalHeaders.map(([name]) => name).join(';');
  const canonicalRequest = [
    method,
    url.pathname,
    url.searchParams.toString(),
    canonicalHeaders.map(([name, value]) => `${name}:${value}\n`).join(''),
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${shortDate}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', longDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, shortDate);
  const regionKey = hmac(dateKey, 'auto');
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmacHex(signingKey, stringToSign);

  const headers = new Headers();
  headers.set('x-amz-content-sha256', payloadHash);
  headers.set('x-amz-date', longDate);
  headers.set(
    'authorization',
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  );
  return headers;
}

function r2ObjectUrl(config: RankingOgStorageConfig, key: string): URL {
  return new URL(
    `/${encodeURIComponent(config.bucket)}/${encodeS3Path(key)}`,
    `https://${config.accountId}.r2.cloudflarestorage.com`
  );
}

export async function rankingOgObjectExists(config: RankingOgStorageConfig, key: string): Promise<boolean> {
  const url = r2ObjectUrl(config, key);
  const headers = signR2Request({ method: 'HEAD', url, config });
  const response = await fetch(url, { method: 'HEAD', headers });
  if (response.ok) return true;
  if (response.status === 404) return false;
  throw new Error(`R2 HEAD failed with ${response.status}`);
}

export async function putRankingOgObject(config: RankingOgStorageConfig, input: RankingOgPutObjectInput) {
  const key = buildRankingOgObjectKey(input);
  const url = r2ObjectUrl(config, key);
  const headers = signR2Request({ method: 'PUT', url, body: input.body, config });
  headers.set('content-type', RANKING_OG_IMAGE_CONTENT_TYPE);
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body: Buffer.from(input.body) as unknown as BodyInit,
  });

  if (!response.ok) {
    throw new Error(`R2 PUT failed with ${response.status}`);
  }

  return {
    key,
    imageUrl: buildRankingOgPublicUrl(config.publicBaseUrl, key),
  };
}
