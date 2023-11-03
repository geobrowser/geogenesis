import Link from 'next/link';

import { OmitStrict, Profile } from '~/core/types';

import { Avatar } from '~/design-system/avatar';

interface EditorRowProps {
  editor: OmitStrict<Profile, 'coverUrl'>;
}

export function MemberRow({ editor }: EditorRowProps) {
  return (
    <Link
      href={editor.profileLink ?? ''}
      className="flex flex-1 items-center gap-2 p-2 transition-colors duration-150 hover:bg-divider"
    >
      <div className="relative h-8 w-8 overflow-hidden rounded-full">
        <Avatar size={32} avatarUrl={editor.avatarUrl} value={editor.address ?? ''} />
      </div>
      <p className="text-metadataMedium">{editor.name}</p>
    </Link>
  );
}
