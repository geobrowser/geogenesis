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
    <ul className="mt-2 mb-5 flex flex-col gap-1">
      {roles.map(role => (
        <li key={`${role.kind}-${role.organizationId}-${role.subject}`} className="min-w-0 text-body break-words">
          {/*
           * Running text rather than a flex row, so a line too long for the
           * column wraps instead of running off it. As a row, the role could not
           * shrink and the company could only truncate — on a phone a long title
           * pushed both out past the edge, and the company read as "M…".
           */}
          <ProfileEntityLink entityId={role.subjectId} spaceId={spaceId} className="text-text hover:underline">
            {role.subject}
          </ProfileEntityLink>
          <span className="text-grey-04"> at </span>
          <OrganizationName role={role} spaceId={spaceId} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The company or school, with its logo.
 *
 * The logo belongs to the company, so it is glued to the first word of the name
 * — a wrap can fall anywhere in the name, but never between the logo and it,
 * which would leave the logo dangling at the end of the line above.
 *
 * `align-middle` sits it on the middle of the lowercase letters; the default
 * baseline left it sitting low and crowding the word before it.
 */
function OrganizationName({ role, spaceId }: { role: CurrentRole; spaceId: string }) {
  const [first, ...rest] = role.organization.split(' ');

  return (
    <ProfileEntityLink entityId={role.organizationId} spaceId={spaceId} className="text-grey-04 hover:underline">
      <span className="whitespace-nowrap">
        <span className="mr-2 inline-flex align-middle">
          <OrganizationImage url={role.avatarUrl} size={20} />
        </span>
        {first}
      </span>
      {rest.length > 0 ? ` ${rest.join(' ')}` : null}
    </ProfileEntityLink>
  );
}
