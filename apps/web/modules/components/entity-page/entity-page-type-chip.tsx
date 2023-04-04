import Link from 'next/link';
import { EntityType } from '~/modules/types';
import { NavUtils } from '~/modules/utils';

interface Props {
  type: EntityType;
}

export function EntityPageTypeChip({ type }: Props) {
  return (
    <Link href={NavUtils.toEntity(type.spaceId, type.id)} passHref>
      <a className="rounded-sm bg-divider px-1 text-footnoteMedium text-grey-04">{type.name ?? type.id}</a>
    </Link>
  );
}
