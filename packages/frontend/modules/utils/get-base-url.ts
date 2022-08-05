export function getBaseUrl() {
  if (window !== undefined) {
    if (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    ) {
      return 'http://localhost:3000'
    }
  }

  return 'https://geogenesis.vercel.app'
}
