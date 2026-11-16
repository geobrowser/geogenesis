export function walletCookieQueryKey(address: string | null | undefined) {
  return ['wallet-cookie', address] as const;
}
