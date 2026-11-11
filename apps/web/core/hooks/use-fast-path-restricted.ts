'use client';

import { useQuery } from '@tanstack/react-query';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSpace } from '~/core/hooks/use-space';
import { readRoleAt, resolveDaoAddress } from '~/core/utils/contracts/read-space-membership';
import { FAST_PATH_RESTRICTED_ROLE } from '~/core/utils/contracts/space-registry';

/** Prefix shared by every fast-path restriction read, for invalidation after a change. */
export const FAST_PATH_RESTRICTED_QUERY_KEY = 'fast-path-restricted';

/**
 * Whether this author is barred from the fast path in a given DAO space.
 *
 * A DAO created with `disableFastPathAccessForNewMembers` grants incoming members the
 * FAST_PATH_RESTRICTED role, and a fast-path proposal from a holder reverts
 * `FastPathRestricted()` (0x3a9c66d4) during gas simulation — before anything is
 * submitted. Offering the choice anyway meant new members picked a path that could
 * never work, so the selector asks the space directly.
 *
 * The role only changes on an explicit editor or governance action, so it's cached for the
 * session rather than refetched on mount like votingSettings.
 *
 * Fails OPEN (returns false, meaning unrestricted) when the space or author is unknown
 * or the read errors: a flaky RPC must not remove a path the user is entitled to. The
 * contract remains the enforcement point either way — this only decides what the UI
 * offers. Controls that act on someone else's role use `useFastPathRestriction` instead.
 */
export function useIsFastPathRestricted(spaceAddress?: string, authorSpaceId?: string | null, enabled = true) {
  const { data, isLoading } = useQuery({
    queryKey: [FAST_PATH_RESTRICTED_QUERY_KEY, spaceAddress?.toLowerCase(), authorSpaceId],
    enabled: Boolean(spaceAddress) && Boolean(authorSpaceId) && enabled,
    staleTime: Infinity,
    queryFn: async (): Promise<boolean> => {
      if (!spaceAddress || !authorSpaceId) return false;

      try {
        return await readRoleAt(spaceAddress as `0x${string}`, authorSpaceId, FAST_PATH_RESTRICTED_ROLE);
      } catch {
        return false;
      }
    },
  });

  return { isFastPathRestricted: data ?? false, isLoading };
}

/**
 * The path the viewer's own role proposals can take: FAST only for an editor who isn't
 * restricted, since a fast-path proposal from a restricted author reverts.
 */
export function useViewerVotingMode({ spaceId, isEditor }: { spaceId: string; isEditor: boolean }) {
  const { space } = useSpace(spaceId);
  const { personalSpaceId } = usePersonalSpaceId();
  const { isFastPathRestricted } = useIsFastPathRestricted(space?.address, personalSpaceId, isEditor);
  return isEditor && !isFastPathRestricted ? ('fast' as const) : ('slow' as const);
}

/**
 * Someone's restriction for controls that act on the answer. It's resolved through the registry
 * like the writes, fetched fresh each time a control mounts, and an error is reported rather than
 * read as "unrestricted", because acting on a wrong answer sends a transaction that reverts.
 */
export function useFastPathRestriction(spaceId?: string, memberSpaceId?: string | null) {
  // One registry lookup per space, shared by every row of a dialog; only the role is read per row.
  const dao = useQuery({
    queryKey: ['dao-address', spaceId],
    enabled: Boolean(spaceId),
    staleTime: Infinity,
    queryFn: () => resolveDaoAddress(spaceId!),
  });
  const role = useQuery({
    queryKey: [FAST_PATH_RESTRICTED_QUERY_KEY, 'fresh', dao.data, memberSpaceId],
    enabled: Boolean(dao.data) && Boolean(memberSpaceId),
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: () => readRoleAt(dao.data!, memberSpaceId!, FAST_PATH_RESTRICTED_ROLE),
  });

  return {
    isRestricted: role.data,
    isLoading: dao.isLoading || role.isLoading,
    isError: dao.isError || role.isError,
  };
}
