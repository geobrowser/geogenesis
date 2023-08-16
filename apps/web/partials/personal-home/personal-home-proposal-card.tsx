import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

export function PersonalHomeProposalCard() {
  return (
    <div className="flex flex-col border border-grey-02 rounded-[12px] grey-02 p-4 shadow-light">
      <Text variant="smallTitle">Proposal Title</Text>
      <div className="flex flex-row items-center gap-4 bg-red-01 mt-2">
        <div className="relative rounded-sm overflow-hidden">
          <Avatar size={12} />
        </div>
        <Text variant="breadcrumb">Jonathan Prozzi</Text>
      </div>
      <div className="flex flex-row bg-green  justify-between w-full ">
        <div />
        <div className="flex flex-row items-center gap-2">
          <div className="w-3 h-3 bg-purple rounded-sm" />
          <Text variant="breadcrumb" color="grey-04">
            Space Name
          </Text>
        </div>
      </div>
    </div>
  );
}
