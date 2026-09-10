/** Whether a value is a loadable media URL: an `ipfs://` URI (resolved via gateway) or an http(s) URL. */
export function isDirectMediaUrl(value: string | null | undefined): value is string {
  return Boolean(value && (value.startsWith('ipfs://') || value.startsWith('http://') || value.startsWith('https://')));
}
