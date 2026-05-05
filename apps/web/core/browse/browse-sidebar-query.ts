export function browseSidebarDataQueryKey(memberSpaceIdOrWallet: string | null | undefined) {
  return ['browse-sidebar-data', memberSpaceIdOrWallet ?? null] as const;
}
