interface Props {
  typeName: string;
}

export function EntityPageTypeChip({ typeName }: Props) {
  return <div className="rounded bg-divider px-2 py-1 text-metadata">{typeName}</div>;
}
