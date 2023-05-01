import { EntityType } from '~/modules/types';

interface Props {
  type: EntityType;
}

export function EntityPageTypeChip({ type }: Props) {
  return (
    <div className="inline-block rounded bg-divider px-2 py-0.5 text-sm font-medium text-grey-04">
      {type.name ?? type.id}
    </div>
  );
}
