'use client';

import { Entity } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { ClientOnly } from '~/design-system/client-only';
import { GeoImage } from '~/design-system/geo-image';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

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
    avatarUrl && (avatarUrl.startsWith('ipfs://') || avatarUrl.startsWith('http')) ? avatarUrl : null;

  const timestamp = entity.updatedAt ? Number(entity.updatedAt) : null;
  const date = timestamp ? new Date(timestamp * 1000) : null;

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
    <Link
      href={NavUtils.toEntity(spaceId, entity.id)}
      spaceId={spaceId}
      entityId={entity.id}
      className="flex items-center gap-5 py-4 hover:bg-bg"
    >
      <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-grey-01">
        {validAvatarUrl ? (
          <GeoImage value={validAvatarUrl} className="object-cover" alt="" fill priority />
        ) : (
          <div className="flex h-full w-full bg-gradient-geo" />
        )}
      </div>
      <div>
        <p className="text-smallTitle font-medium">{entity.name}</p>
        {entity.description && (
          <p className="mt-1 line-clamp-2 block text-resultLink text-grey-04">{entity.description}</p>
        )}
        {date && (
          <ClientOnly>
            <p className="mt-3 text-breadcrumb text-grey-04">
              Last edited {formattedDate} · {formattedTime}
            </p>
          </ClientOnly>
        )}
      </div>
    </Link>
  );
};
