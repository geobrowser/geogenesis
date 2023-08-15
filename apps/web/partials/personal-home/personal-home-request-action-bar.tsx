import { IconButton } from '~/design-system/button';

interface Props {
  spaceId?: string;
  spaceName?: string;
  spaceAvatar?: string;
}

export function PersonalHomeRequestActionBar({ spaceId, spaceName, spaceAvatar }: Props) {
  return (
    <div className="flex flex-row w-full mt-4">
      <span className="text-breadcrumb text-grey-04">{spaceName}</span>
      <div>
        <IconButton icon="close" />
        <IconButton icon="checkCloseSmall" />
      </div>
    </div>
  );
}
