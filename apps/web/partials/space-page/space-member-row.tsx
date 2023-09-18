import { OmitStrict, Profile } from '~/core/types';

import { Avatar } from '~/design-system/avatar';

interface EditorRowProps {
  editor: OmitStrict<Profile, 'coverUrl'>;
}

export function MemberRow({ editor }: EditorRowProps) {
  return (
    <div className="flex items-center gap-2 p-2">
      <div className="relative h-8 w-8 overflow-hidden rounded-full">
        <Avatar size={32} avatarUrl={editor.avatarUrl} value={editor.name ?? ''} />
      </div>
      <p className="text-metadataMedium">{editor.name}</p>
    </div>
  );
}
