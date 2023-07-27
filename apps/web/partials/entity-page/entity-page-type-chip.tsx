import { EntityType } from '~/core/types';

interface Props {
  type: EntityType;
}

export function EntityPageTypeChip({ type }: Props) {
  return (
    <div className="inline-block rounded bg-divider px-[7px] py-px text-sm font-medium text-grey-04">
      {type.name ?? type.id}
    </div>
  );
}
