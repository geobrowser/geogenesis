interface Props {
  typeName: string;
}

export function EntityPageTypeChip({ typeName }: Props) {
  return <div className="rounded-sm bg-divider px-1 text-footnoteMedium text-grey-04">{typeName}</div>;
}
