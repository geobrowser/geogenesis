import { EntityId } from '~/core/io/schema';

interface Props {
  type: { id: EntityId; name: string | null };
}

export function EntityPageTypeChip({ type }: Props) {
  return (
    <div className="flex h-6 items-center rounded border border-grey-02 bg-white px-1.5 text-metadata text-text">
      {type.name ?? type.id}
    </div>
  );
}
