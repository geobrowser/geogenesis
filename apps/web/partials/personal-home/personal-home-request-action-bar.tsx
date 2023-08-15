import { IconButton } from '~/design-system/button';

interface Props {
  spaceId?: string;
  spaceName?: string;
  spaceAvatar?: string;
}

export function PersonalHomeRequestActionBar({ spaceId, spaceName, spaceAvatar }: Props) {
  return (
    <div className="flex flex-row w-full mt-4 items-center justify-between">
      <span className="text-breadcrumb text-grey-04">{spaceName}</span>
      <div className="flex flex-row gap-2">
        <IconButton icon="close" className="border border-grey-02 rounded-sm p-2" />
        <IconButton icon="tick" className="border border-grey-02 rounded-sm p-2" />
      </div>
    </div>
  );
}
