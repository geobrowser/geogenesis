import BoringAvatar from 'boring-avatars';
import clsx from 'classnames';

interface Props {
  usernames: string[];
}

export function AvatarGroup({ usernames }: Props) {
  return (
    <ul className="flex items-center -space-x-2">
      {usernames.map((username, i) => (
        <li key={username} className={clsx({ 'rounded-full border border-white': i !== 0 })}>
          <BoringAvatar size={16} name={username} variant="pixel" />
        </li>
      ))}
    </ul>
  );
}
