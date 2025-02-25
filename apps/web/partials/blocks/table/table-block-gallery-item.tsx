import { CONTENT_IDS, SYSTEM_IDS } from '@graphprotocol/grc-20';
import Image from 'next/image';
import Link from 'next/link';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Cell } from '~/core/types';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { CheckCircle } from '~/design-system/icons/check-circle';

import { TableBlockPropertyField } from './table-block-property-field';

type Props = {
  columns: Record<string, Cell>;
  currentSpaceId: string;
};

export function TableBlockGalleryItem({ columns, currentSpaceId }: Props) {
  const nameCell: Cell | undefined = columns[SYSTEM_IDS.NAME_ATTRIBUTE];
  const maybeAvatarData: Cell | undefined = columns[CONTENT_IDS.AVATAR_ATTRIBUTE];
  const maybeCoverData: Cell | undefined = columns[SYSTEM_IDS.COVER_ATTRIBUTE];

  // @TODO: An "everything" else ID that can be used to render any renderable.
  const { cellId, name, verified } = nameCell;
  let { image } = nameCell;

  const maybeAvatarUrl = maybeAvatarData?.renderables.find(r => r.attributeId === CONTENT_IDS.AVATAR_ATTRIBUTE)?.value;

  const maybeCoverUrl = maybeCoverData?.renderables.find(r => r.attributeId === SYSTEM_IDS.COVER_ATTRIBUTE)?.value;

  if (maybeAvatarUrl) {
    image = maybeAvatarUrl;
  }

  if (maybeCoverUrl) {
    image = maybeCoverUrl;
  }

  const href = NavUtils.toEntity(nameCell?.space ?? currentSpaceId, cellId);

  const otherPropertyData = Object.values(columns).filter(
    c =>
      c.slotId !== SYSTEM_IDS.NAME_ATTRIBUTE &&
      c.slotId !== CONTENT_IDS.AVATAR_ATTRIBUTE &&
      c.slotId !== SYSTEM_IDS.COVER_ATTRIBUTE &&
      c.slotId !== SYSTEM_IDS.DESCRIPTION_ATTRIBUTE
  );

  return (
    <Link href={href} className="group flex flex-col gap-3">
      <div className="relative aspect-[2/1] w-full overflow-clip rounded-lg bg-grey-01">
        <Image
          src={image ? getImagePath(image) : PLACEHOLDER_SPACE_IMAGE}
          className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
          alt=""
          fill
        />
      </div>
      <div className="flex items-center gap-2">
        {verified && (
          <div>
            <CheckCircle />
          </div>
        )}
        <div className="truncate text-smallTitle font-medium text-text">{name}</div>
      </div>
      {otherPropertyData.map(p => {
        return (
          <TableBlockPropertyField
            key={p.slotId}
            renderables={p.renderables}
            spaceId={currentSpaceId}
            entityId={cellId}
          />
        );
      })}
    </Link>
  );
}
