interface Props {
  title: string;
  amount: string;
}

export function PersonalHomeSidebarCard({ title, amount }: Props) {
  return (
    <div className="flex flex-col items-center justify-center w-full bg-grey-01 rounded pt-4 pb-3">
      <span className="text-grey-04 text-sm">{title}</span>
      <span className="text-text body-bold text-2xl">{amount}</span>
    </div>
  );
}
