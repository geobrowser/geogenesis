/**
 * geo-chat's public base URL, the one a browser reaches.
 *
 * Its own module, not `api.ts`, because that one is `'use client'` and a route handler cannot call
 * what it exports. The explore feed builds URLs the browser will load (the poster stills) on the
 * server, and they have to come out identical to the ones the card builds, or the browser fetches
 * the same still twice.
 */
export function getGeoChatApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_GEO_CHAT_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
}
