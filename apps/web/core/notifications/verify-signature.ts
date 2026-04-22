import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies a gaia notification-service webhook signature.
 *
 * Gaia sends `X-Geo-Signature: sha256=<hex>` where the hex is HMAC-SHA256 of the
 * raw request body bytes (per notification-service/TECH_DESIGN.md). The signature
 * must be verified against the exact bytes received — never a re-serialized JSON.
 */
export function verifyGeoSignature({
  rawBody,
  signatureHeader,
  secret,
}: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
}): boolean {
  if (!signatureHeader) return false;

  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) return false;

  const provided = signatureHeader.slice(prefix.length).trim();
  if (provided.length === 0) return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  if (expected.length !== provided.length) return false;

  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
}
