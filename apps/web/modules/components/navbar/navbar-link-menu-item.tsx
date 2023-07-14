import Image from 'next/image';
import { Spacer } from '~/modules/design-system/spacer';
import { Text } from '~/modules/design-system/text';

interface NavbarLinkMenuItemProps {
  children: string;
  onClick: () => void;
  img: string | null;
}

export function NavbarLinkMenuItem({ children, onClick, img }: NavbarLinkMenuItemProps) {
  return (
    <button onClick={onClick} className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg">
      {img && (
        <>
          <div className="relative h-4 w-4 overflow-hidden rounded-sm">
            <Image priority layout="fill" objectFit="cover" src={img} alt="Image representing the current Space" />
          </div>
          <Spacer width={8} />
        </>
      )}
      <Text variant="button" className="hover:!text-text">
        {children}
      </Text>
    </button>
  );
}
