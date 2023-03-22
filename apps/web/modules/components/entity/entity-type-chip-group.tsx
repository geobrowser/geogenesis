import { EntityPageTypeChip } from '../entity-page/entity-page-type-chip';

interface Props {
  types: string[];
}

export function EntityTypeChipGroup({ types }: Props) {
  return (
    <ul className="flex items-center gap-1">
      {types.map(t => (
        <li key={t}>
          <EntityPageTypeChip typeName={t} />
        </li>
      ))}
    </ul>
  );
}
