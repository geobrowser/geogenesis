import { ContentIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';

/** Whether a value is a loadable media URL: an `ipfs://` URI (resolved via gateway) or an http(s) URL. */
export function isDirectMediaUrl(value: string | null | undefined): value is string {
  return Boolean(value && (value.startsWith('ipfs://') || value.startsWith('http://') || value.startsWith('https://')));
}

/**
 * The media URL among an image/video entity's values. An `ipfs://` value on any property wins
 * (legacy media blocks keep it unlabelled); an http(s) URL is read only from `Web URL`, since that
 * property is also a general canonical link and the callers do not check the target's entity type.
 *
 * Lives here rather than beside the hooks that use it so the non-React readers —
 * anything holding values straight off a GraphQL response — can pick the URL the
 * same way rather than guessing at the first value that looks like a string.
 */
export function findMediaUrlValue(values: { value: unknown; property: { id: string } }[]): string | undefined {
  const ipfsValue = values.find(v => typeof v.value === 'string' && v.value.startsWith('ipfs://'));
  if (typeof ipfsValue?.value === 'string') return ipfsValue.value;
  const webUrlValue = values.find(
    v =>
      ID.equals(v.property.id, ContentIds.WEB_URL_PROPERTY) && typeof v.value === 'string' && isDirectMediaUrl(v.value)
  );
  return typeof webUrlValue?.value === 'string' ? webUrlValue.value : undefined;
}
