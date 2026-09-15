'use client';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import type { CurrentRole } from '~/core/profile/profile-summary';

import { FallbackImage } from '~/design-system/fallback-image';

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
    // `mb-4` rather than `mb-1`: the description below pulls itself up by 12px
    // to sit tight under the name, which is right when it *is* under the name
    // and wrong here, where three current roles sit between them. The margin
    // pays that back and leaves a real gap.
    <ul className="mt-3 mb-4 flex flex-col gap-1">
      {roles.map(role => (
        <li key={`${role.kind}-${role.organizationId}-${role.subject}`} className="min-w-0 truncate">
          <span className="text-metadata text-text">
            <ProfileEntityLink entityId={role.subjectId} spaceId={spaceId} className="hover:underline">
              {role.subject}
            </ProfileEntityLink>{' '}
            <span className="text-grey-04">at </span>
            {/*
             * The logo sits with the company, not at the head of the line. It is
             * the company's mark: in front of the role it read as an icon for
             * the job, and three different marks down the left edge read as a
             * list of kinds rather than of employers.
             */}
            <span className="relative mr-1 -mb-0.5 inline-block h-4 w-4 shrink-0 overflow-hidden rounded-sm bg-grey-01 align-baseline">
              <FallbackImage value={role.avatarUrl ?? PLACEHOLDER_SPACE_IMAGE} sizes="16px" className="object-cover" />
            </span>
            <ProfileEntityLink
              entityId={role.organizationId}
              spaceId={spaceId}
              className="text-grey-04 hover:underline"
            >
              {role.organization}
            </ProfileEntityLink>
          </span>
        </li>
      ))}
    </ul>
  );
}
