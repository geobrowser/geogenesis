/**
 * A value that is already a browser-loadable media URL: an `ipfs://` URI (resolved through a
 * gateway by `getImagePath`/`getVideoPath`) or a direct http(s) URL — e.g. debate media left in
 * object storage and referenced via the `Web URL` property instead of being pinned to IPFS.
 */
export function isDirectMediaUrl(value: string | null | undefined): value is string {
  return Boolean(value && (value.startsWith('ipfs://') || value.startsWith('http://') || value.startsWith('https://')));
}
