'use client';

import type { CurrentRole } from '~/core/profile/profile-summary';

import { Avatar } from '~/design-system/avatar';

import { ProfileEntityLink } from './profile-entity-link';

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
          {/*
           * `Avatar` sizes to its box, not to `size` — that prop only reaches
           * the generated fallback — so an organisation with a logo needs this
           * wrapper or it fills the row.
           */}
          <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-sm bg-grey-01">
            <Avatar size={16} value={role.organizationId} avatarUrl={role.avatarUrl ?? undefined} square />
          </span>
          <span className="min-w-0 truncate text-metadata text-text">
            <ProfileEntityLink entityId={role.subjectId} spaceId={spaceId} className="hover:underline">
              {role.subject}
            </ProfileEntityLink>{' '}
            <span className="text-grey-04">
              at{' '}
              <ProfileEntityLink entityId={role.organizationId} spaceId={spaceId} className="hover:underline">
                {role.organization}
              </ProfileEntityLink>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
