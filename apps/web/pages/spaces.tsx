import { useSpaces } from '~/modules/state/use-spaces';

export default function Spaces() {
  const { spaces } = useSpaces();

  return (
    <div>
      {spaces.map(space => (
        <h1 key={space.id}>{space.id}</h1>
      ))}
    </div>
  );
}
