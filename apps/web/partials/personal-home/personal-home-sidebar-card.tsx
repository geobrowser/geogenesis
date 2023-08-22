import { Icon } from '~/design-system/icon';
import { Text } from '~/design-system/text';

interface Props {
  title: string;
  amount: number;
  proposalStatus: string;
}

export function PersonalHomeSidebarCard({ title, amount, proposalStatus }: Props) {
  return (
    <div className="flex flex-col justify-center w-full rounded border border-grey-02 px-4 pt-4 pb-3">
      <Text variant="footnoteMedium" color="grey-04">
        {title}
      </Text>
      <div className="flex flex-row items-center justify-between w-full pt-4 pb-3">
        <div className="flex flex-row items-center gap-2 ">
          <Icon icon="checkCircleSmall" />
          <Text variant="button">{proposalStatus}</Text>
        </div>
        <Text variant="button">{amount}</Text>
      </div>
      <div className="flex flex-row items-center justify-between w-full pb-3">
        <div className="flex flex-row items-center gap-2 ">
          <Icon icon="checkCircleSmall" />
          <Text variant="button">{proposalStatus}</Text>
        </div>
        <Text variant="button">{amount}</Text>
      </div>
      <div className="flex flex-row items-center justify-between w-full pb-3">
        <div className="flex flex-row items-center gap-2 ">
          <Icon icon="checkCircleSmall" />
          <Text variant="button">{proposalStatus}</Text>
        </div>
        <Text variant="button">{amount}</Text>
      </div>
    </div>
  );
}
