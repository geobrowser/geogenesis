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
 * `quoteMedium` (17px) against the description's `body` (20px). At `metadata`
 * (16px) the two sat four pixels apart and read as one block set at two sizes
 * for no reason; a 17/20 step reads as a caption above a paragraph, which is
 * what it is.
 *
 * Renders nothing at all when there is nothing current, which is most accounts.
 */
export function ProfileHeadline({ roles, spaceId }: Props) {
  if (roles.length === 0) return null;

  return (
    // `mb-5` pays back the description's own `-mt-3` — it pulls itself up to sit
    // tight under the name, which is right when it is under the name and wrong
    // with three roles in between — and leaves a real gap on top of that.
    <ul className="mt-3 mb-5 flex flex-col gap-1.5">
      {roles.map(role => (
        <li
          key={`${role.kind}-${role.organizationId}-${role.subject}`}
          className="flex min-w-0 items-center gap-2 text-quoteMedium"
        >
          <span className="shrink-0">
            <ProfileEntityLink entityId={role.subjectId} spaceId={spaceId} className="text-text hover:underline">
              {role.subject}
            </ProfileEntityLink>
            <span className="text-grey-04"> at</span>
          </span>

          {/*
           * The logo belongs to the company, so it sits with the company's name
           * rather than at the head of the line. Centred in a flex row rather
           * than nudged onto the baseline inline, which is what left it sitting
           * low and crowding the word before it.
           */}
          <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-sm bg-grey-01">
            <FallbackImage value={role.avatarUrl ?? PLACEHOLDER_SPACE_IMAGE} sizes="20px" className="object-cover" />
          </span>

          <ProfileEntityLink
            entityId={role.organizationId}
            spaceId={spaceId}
            className="min-w-0 truncate text-grey-04 hover:underline"
          >
            {role.organization}
          </ProfileEntityLink>
        </li>
      ))}
    </ul>
  );
}
