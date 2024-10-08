import { EntityId } from '~/core/io/schema';

interface Props {
  type: { id: EntityId; name: string | null };
}

export function EntityPageTypeChip({ type }: Props) {
  return (
    <div className="flex h-6 items-center rounded-sm bg-divider px-[7px] py-px text-breadcrumb text-grey-04">
      {type.name ?? type.id}
    </div>
  );
}
