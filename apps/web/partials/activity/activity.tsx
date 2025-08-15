'use client';

import Image from 'next/image';
import Link from 'next/link';

import { Entities } from '~/core/utils/entity';
import { NavUtils, getImagePath } from '~/core/utils/utils';
import { Entity } from '~/core/v2.types';

type ActivityProps = {
  spaceId: string;
  entities: Entity[];
};

export const Activity = ({ spaceId, entities }: ActivityProps) => {
  return (
    <div className="divide-y divide-divider">
      {entities.map(entity => (
        <EntityRow key={entity.id} spaceId={spaceId} entity={entity} />
      ))}
    </div>
  );
};

type EntityRowProps = {
  spaceId: string;
  entity: Entity;
};

const EntityRow = ({ spaceId, entity }: EntityRowProps) => {
  const avatarUrl = Entities.avatar(entity.relations);

  // @TODO move validation into Entities.avatar util
  const validAvatarUrl =
    avatarUrl && (avatarUrl.startsWith('ipfs://') || avatarUrl.startsWith('http')) ? getImagePath(avatarUrl) : null;

  const timestamp = entity.updatedAt ? parseInt(entity.updatedAt, 10) : null;
  const date = timestamp ? new Date(timestamp * 60) : null;

  const formattedDate = date
    ? date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  const formattedTime = date
    ? date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '';

  return (
    <Link href={NavUtils.toEntity(spaceId, entity.id)} className="flex items-center gap-5 py-4 hover:bg-bg">
      <div className="relative size-10 flex-shrink-0 overflow-hidden rounded-md bg-grey-01">
        {validAvatarUrl ? (
          <Image src={validAvatarUrl} className="object-cover" alt="" fill priority />
        ) : (
          <div className="flex h-full w-full" />
        )}
      </div>
      <div>
        <p className="text-smallTitle font-medium">{entity.name}</p>
        {entity.description && (
          <p className="mt-1 line-clamp-2 block text-resultLink text-grey-04">{entity.description}</p>
        )}
        {date && (
          <p className="mt-3 text-breadcrumb text-grey-04">
            Last edited {formattedDate} · {formattedTime}
          </p>
        )}
      </div>
    </Link>
  );
};
