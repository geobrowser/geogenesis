'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { fetchRoleSkills, roleSkillsQueryKey } from '~/core/io/subgraph/fetch-role-skills';
import { suggestSkills } from '~/core/profile/rank-role-skills';

type Params = {
  /** The occupation the user picked, if they have picked one yet. */
  roleId: string | undefined;
  /** Skills already on the draft, which are not worth suggesting again. */
  picked: string[];
};

/**
 * Skills worth offering once a role has been chosen.
 *
 * Only occupations from the ESCO import have any: a job title somebody typed in
 * themselves has no skills hanging off it, and the answer is an empty list
 * rather than a worse one. Nothing here blocks the sheet — the skills picker
 * works the same whether or not any of this resolves.
 */
export function useSuggestedSkills({ roleId, picked }: Params) {
  const { data, isLoading } = useQuery({
    queryKey: roleSkillsQueryKey(roleId),
    enabled: roleId !== undefined && roleId !== '',
    queryFn: () => fetchRoleSkills(roleId as string),
    // The taxonomy is a published import, so it does not move under us.
    staleTime: Infinity,
  });

  const suggestions = React.useMemo(() => suggestSkills(data ?? [], picked), [data, picked]);

  /**
   * The same ranking with nothing trimmed, for the picker to offer before
   * anything is typed. Five pills are a shortcut past searching; a product
   * manager has dozens of skills recorded, and choosing from five meant choosing
   * from whichever five happened to rank highest.
   */
  const all = React.useMemo(() => suggestSkills(data ?? [], picked, Infinity), [data, picked]);

  return { suggestions, all, isLoading: isLoading && roleId !== undefined };
}
