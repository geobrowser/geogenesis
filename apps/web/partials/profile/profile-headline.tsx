'use client';

import Link from 'next/link';

import type { CurrentRole } from '~/core/profile/profile-summary';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';

type Props = {
  roles: CurrentRole[];
  spaceId: string;
};

/**
 * What this person is doing now, under their name (GEO-2859).
 *
 * Every current role and degree, not one derived from them. The reference
 * account holds three at once — two jobs and a PhD — and choosing between them
 * would mean inventing a rule about which job is the real one.
 *
 * Renders nothing at all when there is nothing current, which is most accounts.
 */
export function ProfileHeadline({ roles, spaceId }: Props) {
  if (roles.length === 0) return null;

  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {roles.map(role => (
        <li key={`${role.kind}-${role.organizationId}-${role.subject}`} className="flex items-center gap-2">
          <Avatar size={16} value={role.organizationId} avatarUrl={role.avatarUrl ?? undefined} square />
          <span className="min-w-0 truncate text-metadata text-text">
            {role.subject}{' '}
            <span className="text-grey-04">
              at{' '}
              <Link href={NavUtils.toEntity(spaceId, role.organizationId)} className="hover:underline">
                {role.organization}
              </Link>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
