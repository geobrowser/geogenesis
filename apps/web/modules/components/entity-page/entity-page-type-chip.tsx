import { EntityType } from '~/modules/types';

interface Props {
  type: EntityType;
}

export function EntityPageTypeChip({ type }: Props) {
  return <div className="rounded-sm bg-divider px-1 text-footnoteMedium text-grey-04">{type.name ?? type.id}</div>;
}
