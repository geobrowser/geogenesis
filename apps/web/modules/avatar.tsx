import BoringAvatar from 'boring-avatars';

export const Avatar = ({ value, size = '100%' }: { value: string; size?: number | string }) => {
  return (
    <div className="inline-block rounded border-4">
      <BoringAvatar size={size} square={true} name={value} variant="pixel" />
    </div>
  );
};
