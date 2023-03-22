interface Props {
  typeName: string;
}

export function EntityPageTypeChip({ typeName }: Props) {
  return <div className="rounded-sm bg-divider px-2 py-1 text-metadata">{typeName}</div>;
}
