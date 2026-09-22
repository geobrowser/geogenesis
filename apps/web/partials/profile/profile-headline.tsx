'use client';

import type { CurrentRole } from '~/core/profile/profile-summary';

import { OrganizationImage } from './organization-image';
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
 * Set in `body`, exactly as the description below is. They are the same kind of
 * statement about this person — one written, one derived — and any step between
 * them reads as one block set at two sizes for no reason. The colour does the
 * separating instead: the role in `text`, everything around it in `grey-04`.
 *
 * Renders nothing at all when there is nothing current, which is most accounts.
 */
export function ProfileHeadline({ roles, spaceId }: Props) {
  if (roles.length === 0) return null;

  return (
    // Centred between the name and the description: `mt-2` is the gap above,
    // and `mb-5` is 20px less the description's own `-mt-3`, which pulls itself
    // up to sit tight under the name — right when it *is* under the name, wrong
    // with three roles in between. Both come out at 8px.
    <ul className="mt-2 mb-5 flex flex-col">
      {roles.map(role => (
        <li
          key={`${role.kind}-${role.organizationId}-${role.subject}`}
          className="flex min-w-0 items-center gap-2 text-body"
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
          <OrganizationImage url={role.avatarUrl} size={20} />

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
