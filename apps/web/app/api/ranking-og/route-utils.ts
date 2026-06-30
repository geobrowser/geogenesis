import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { type RankingOgVariant, isRankingOgVariant } from '~/core/blocks/ranking/ranking-og-storage';

export function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin) return process.env.NODE_ENV !== 'production';
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function hasRankingOgAdminSecret(req: Request): boolean {
  const configured = process.env.INTERNAL_API_SECRET?.trim();
  if (!configured) return false;
  return req.headers.get('x-internal-api-secret') === configured;
}

export function isSafeOgVersion(value: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(value);
}

export function isValidEntityId(value: string): boolean {
  return IdUtils.isValid(value);
}

export function parseVariant(value: string | null): RankingOgVariant | null {
  return isRankingOgVariant(value) ? value : null;
}

export function parseVariants(value: unknown): RankingOgVariant[] | null {
  if (value === undefined) return ['landscape', 'story'];
  if (!Array.isArray(value)) return null;
  const variants = value.filter(isRankingOgVariant);
  if (variants.length !== value.length || variants.length === 0) return null;
  return [...new Set(variants)];
}
