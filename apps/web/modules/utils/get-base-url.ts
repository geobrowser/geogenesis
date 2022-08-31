export function getBaseUrl() {
  if (window !== undefined) {
    return window.location.origin
  }

  return 'https://geogenesis.vercel.app'
}
