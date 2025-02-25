import { CONTENT_IDS, SYSTEM_IDS } from '@graphprotocol/grc-20';
import Image from 'next/image';
import Link from 'next/link';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Cell } from '~/core/types';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { CheckCircle } from '~/design-system/icons/check-circle';
import { Spacer } from '~/design-system/spacer';

import { TableBlockPropertyField } from './table-block-property-field';

type Props = {
  columns: Record<string, Cell>;
  currentSpaceId: string;
};

export function TableBlockListItem({ columns, currentSpaceId }: Props) {
  const nameCell = columns[SYSTEM_IDS.NAME_ATTRIBUTE];
  const maybeAvatarData: Cell | undefined = columns[CONTENT_IDS.AVATAR_ATTRIBUTE];
  const maybeCoverData: Cell | undefined = columns[SYSTEM_IDS.COVER_ATTRIBUTE];
  const maybeDescriptionData: Cell | undefined = columns[SYSTEM_IDS.DESCRIPTION_ATTRIBUTE];

  // @TODO: An "everything" else ID that can be used to render any renderable.
  const { cellId, name, verified } = nameCell;
  let { description, image } = nameCell;

  const maybeDescription = maybeDescriptionData?.renderables.find(
    r => r.attributeId === SYSTEM_IDS.DESCRIPTION_ATTRIBUTE
  )?.value;

  if (maybeDescription) {
    description = maybeDescription;
  }

  const maybeAvatarUrl = maybeAvatarData?.renderables.find(r => r.attributeId === CONTENT_IDS.AVATAR_ATTRIBUTE)?.value;

  const maybeCoverUrl = maybeCoverData?.renderables.find(r => r.attributeId === SYSTEM_IDS.COVER_ATTRIBUTE)?.value;

  if (maybeCoverUrl) {
    image = maybeCoverUrl;
  }

  if (maybeAvatarUrl) {
    image = maybeAvatarUrl;
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
    <div>
      <Link href={href} className="group flex w-full max-w-full items-start justify-start gap-6 pr-6">
        <div className="relative h-20 w-20 flex-shrink-0 overflow-clip rounded-lg bg-grey-01">
          <Image
            src={image ? getImagePath(image) : PLACEHOLDER_SPACE_IMAGE}
            className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
            alt=""
            fill
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            {verified && (
              <div>
                <CheckCircle />
              </div>
            )}
            <div className="line-clamp-1 text-smallTitle font-medium text-text md:line-clamp-2">{name}</div>
          </div>
          {description && (
            <div className="mt-0.5 line-clamp-4 text-metadata text-grey-04 md:line-clamp-3">{description}</div>
          )}

          {otherPropertyData.map(p => {
            return (
              <>
                <Spacer height={12} />
                <TableBlockPropertyField
                  key={p.slotId}
                  renderables={p.renderables}
                  spaceId={currentSpaceId}
                  entityId={cellId}
                />
              </>
            );
          })}
        </div>
      </Link>
    </div>
  );
}
