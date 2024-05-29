import { EntitySearchResult } from '~/core/types';

interface Props {
  type: EntitySearchResult;
}

export function EntityPageTypeChip({ type }: Props) {
  return (
    <div className="flex h-6 items-center rounded-sm bg-divider px-[7px] py-px text-breadcrumb text-grey-04">
      {type.name ?? type.id}
    </div>
  );
}
