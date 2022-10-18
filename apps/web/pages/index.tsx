import Link from 'next/link';
import { useSpaces } from '~/modules/state/use-spaces';

export default function Spaces() {
  const { spaces } = useSpaces();

  return (
    <div>
      {spaces.map(space => (
        <Link key={space.id} href={`/space/${space.id}`}>
          <h1 style={{ textDecoration: 'underline', cursor: 'pointer' }}>{space.id}</h1>
        </Link>
      ))}
    </div>
  );
}
