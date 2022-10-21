import { Space__factory } from '~/../../packages/contracts';
import { useRouter } from 'next/router';
import { FormEvent } from 'react';
import { useSigner } from 'wagmi';
import { useSpaces } from '~/modules/state/use-spaces';

export default function AccessControl() {
  const store = useSpaces();
  const { data: signer } = useSigner();
  const router = useRouter();
  const { id: spaceId } = router.query as { id: string };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const address = formData.get('address');

    if (signer) {
      const contract = Space__factory.connect(spaceId, signer);
      const tx = await contract.grantRole(await contract.EDITOR_ROLE(), address as string);
      await tx.wait();
    }
  };

  return (
    <div>
      <form onSubmit={onSubmit}>
        <input name="address" placeholder="Address..." />
        <button>Add address</button>
      </form>

      <h1 style={{ marginTop: 16 }}>Admins</h1>
      <ul>
        {store.spaces
          .find(space => space.id == spaceId)
          ?.admins.map(editor => (
            <li key={editor.id}>{editor.id}</li>
          ))}
      </ul>

      <h1 style={{ marginTop: 16 }}>Editors</h1>
      <ul>
        {store.spaces
          .find(space => space.id == spaceId)
          ?.editors.map(editor => (
            <li key={editor.id}>{editor.id}</li>
          ))}
      </ul>
    </div>
  );
}
