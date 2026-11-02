/**
 * Where server code reaches geo-chat. `GEO_CHAT_API_BASE_URL` may be a cluster-internal host and is
 * preferred; the public variable is the fallback, and can be the relative `/geo-chat-proxy` of the
 * dev setup, which a server-side `fetch` cannot use, so a server caller should not read it alone.
 */
export function geoChatBaseUrl() {
  const base =
    process.env.GEO_CHAT_API_BASE_URL || process.env.NEXT_PUBLIC_GEO_CHAT_API_BASE_URL || 'http://localhost:8080';
  return base.replace(/\/+$/, '');
}
