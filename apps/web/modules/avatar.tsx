import BoringAvatar from 'boring-avatars';

export const Avatar = ({ value, size = '100%' }: { value: string; size?: number | string }) => {
  return (
    <div className="border-4 rounded inline-block">
      <BoringAvatar size={size} square={true} name={value} variant="beam" />
    </div>
  );
};
